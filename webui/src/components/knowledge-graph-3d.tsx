"use client";

import { Focus, Orbit } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type GraphData,
  type NodeObject,
} from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import type { KnowledgeNode, KnowledgeSpace } from "@backend/knowledge/sdk";

type GraphNode = {
  id: string;
  title: string;
  type: string;
  color: string;
  knowledgeNode: KnowledgeNode;
  value: number;
  x: number;
  y: number;
  z: number;
};

type GraphLink = {
  id: string;
  source: string;
  target: string;
  relation: string;
};

type GraphLabel = SpriteText & {
  material: { depthWrite: boolean; opacity: number };
  textHeight: number;
  userData: Record<string, unknown>;
};

type OrbitControls = {
  autoRotate: boolean;
  autoRotateSpeed: number;
  dampingFactor?: number;
  enableDamping?: boolean;
  maxDistance?: number;
  minDistance?: number;
  panSpeed?: number;
  rotateSpeed?: number;
  update?: () => void;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const NODE_PALETTE = ["#315df5", "#7847e8", "#078f68", "#d94867", "#c56f0a", "#087fa8"];

export function KnowledgeGraph3D({
  onSelectNode,
  selectedNodeId,
  space,
  visibleNodes,
}: {
  active: boolean;
  onSelectNode: (id: string) => void;
  selectedNodeId: string;
  space: KnowledgeSpace;
  visibleNodes: KnowledgeNode[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const labelsRef = useRef(new Map<string, GraphLabel>());
  const hasFittedRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [autoRotate, setAutoRotate] = useState(false);
  const [dark, setDark] = useState(false);

  const graphData = useMemo<GraphData<GraphNode, GraphLink>>(() => {
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = space.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    const degreeByNode = new Map<string, number>();
    visibleEdges.forEach((edge) => {
      degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
      degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);
    });
    const colorByNode = assignAdjacentColors(visibleNodes, visibleEdges);
    const radius = Math.max(38, Math.min(105, 26 * Math.cbrt(Math.max(visibleNodes.length, 1))));
    return {
      nodes: visibleNodes.map((node, index) => {
        const progress = (index + 0.5) / Math.max(visibleNodes.length, 1);
        const z = radius * (1 - 2 * progress);
        const ringRadius = Math.sqrt(Math.max(radius ** 2 - z ** 2, 0));
        const angle = index * GOLDEN_ANGLE + stableAngle(space.id);
        return {
          id: node.id,
          title: node.title,
          type: node.type,
          color: colorByNode.get(node.id) ?? nodeColor(node.id, space.color),
          knowledgeNode: node,
          value: 1 + Math.min(Math.sqrt(degreeByNode.get(node.id) ?? 0) * 0.62, 2.3),
          x: Math.cos(angle) * ringRadius + (finiteCoordinate(node.x, 50) - 50) * 0.18,
          y: Math.sin(angle) * ringRadius + (finiteCoordinate(node.y, 50) - 50) * 0.18,
          z,
        };
      }),
      links: visibleEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
        })),
    };
  }, [space.color, space.edges, space.id, visibleNodes]);

  const topologyKey = useMemo(
    () => `${space.id}:${visibleNodes.map((node) => node.id).join(",")}:${graphData.links.map((link) => link.id).join(",")}`,
    [graphData.links, space.id, visibleNodes],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => setSize({
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
    });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setDark(root.dataset.theme === "dark");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    hasFittedRef.current = false;
  }, [topologyKey]);

  useEffect(() => {
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    labelsRef.current.forEach((_, id) => {
      if (!visibleIds.has(id)) labelsRef.current.delete(id);
    });
  }, [visibleNodes]);

  useEffect(() => {
    const graph = graphRef.current;
    const controls = graph?.controls() as OrbitControls | undefined;
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.72;
    controls.panSpeed = 0.65;
    controls.minDistance = 36;
    controls.maxDistance = 900;
    controls.update?.();
  }, [autoRotate, size.width]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || size.width <= 1) return;
    graph.d3Force("charge")?.strength?.(-115 - Math.min(visibleNodes.length * 2.5, 95));
    graph.d3Force("link")?.distance?.(52 + Math.min(visibleNodes.length, 40) * 0.35);
  }, [size.width, topologyKey, visibleNodes.length]);

  const resetView = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || visibleNodes.length === 0) return false;
    const bounds = graph.getGraphBbox() as ReturnType<typeof graph.getGraphBbox> | null;
    if (!isValidBounds(bounds)) return false;

    const padding = size.width < 720 ? 34 : 64;
    graph.zoomToFit(0, padding);
    const center = {
      x: (bounds.x[0] + bounds.x[1]) / 2,
      y: (bounds.y[0] + bounds.y[1]) / 2,
      z: (bounds.z[0] + bounds.z[1]) / 2,
    };
    const camera = graph.camera();
    if (!camera?.position) return false;
    const distance = Math.max(90, Math.hypot(
      camera.position.x - center.x,
      camera.position.y - center.y,
      camera.position.z - center.z,
    ));
    const direction = { x: 0.58, y: 0.36, z: 0.73 };
    graph.cameraPosition({
      x: center.x + direction.x * distance,
      y: center.y + direction.y * distance,
      z: center.z + direction.z * distance,
    }, center, 650);
    return true;
  }, [size.width, visibleNodes.length]);

  const focusNode = useCallback((node: NodeObject<GraphNode>) => {
    onSelectNode(node.id ? String(node.id) : "");
    if (typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") return;
    const distance = Math.hypot(node.x, node.y, node.z) || 1;
    const ratio = 1 + 90 / distance;
    graphRef.current?.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      700,
    );
  }, [onSelectNode]);

  const makeNodeObject = useCallback((node: NodeObject<GraphNode>) => {
    const id = String(node.id);
    // Always return a fresh object. Reusing a Three.js object across force-graph
    // digest cycles leaves its internal data binding without an owner on removal.
    const textHeight = 5.2 + Math.min((finiteCoordinate(node.value, 1) - 1) * 0.82, 2.3);
    const label = new SpriteText(compactTitle(node.title), textHeight, node.color) as GraphLabel;
    label.fontFace = "system-ui, sans-serif";
    label.fontWeight = "800";
    label.strokeColor = dark ? "rgba(5, 12, 24, 0.92)" : "rgba(255, 255, 255, 0.98)";
    label.strokeWidth = dark ? 1.7 : 2.2;
    label.material.depthWrite = false;
    label.material.opacity = 0.96;
    label.userData.baseTextHeight = textHeight;
    label.userData.nodeColor = node.color;
    label.userData.nodeId = id;
    labelsRef.current.set(id, label);
    return label;
  }, [dark]);

  useEffect(() => {
    labelsRef.current.forEach((label, id) => {
      const selected = id === selectedNodeId;
      const color = String(label.userData.nodeColor || space.color);
      label.color = selected ? mixHexColor(color, dark ? "#ffffff" : "#071c2e", 0.18) : color;
      label.strokeColor = dark ? "rgba(5, 12, 24, 0.94)" : "rgba(255, 255, 255, 0.98)";
      label.strokeWidth = selected ? (dark ? 2.2 : 2.8) : (dark ? 1.7 : 2.2);
      label.fontWeight = "800";
      const baseTextHeight = finiteCoordinate(label.userData.baseTextHeight, 5.2);
      label.textHeight = baseTextHeight * (selected ? 1.15 : 1);
    });
  }, [dark, selectedNodeId, space.color]);

  return (
    <div
      aria-label={`${space.name}三维知识图谱`}
      className="knowledge-graph knowledge-graph-3d h-full min-h-0 w-full"
      ref={containerRef}
      role="application"
    >
      {size.width > 0 && size.height > 0 && (
        <ForceGraph3D<GraphNode, GraphLink>
          backgroundColor="rgba(0,0,0,0)"
          controlType="orbit"
          cooldownTicks={120}
          enableNavigationControls
          enableNodeDrag={false}
          graphData={graphData}
          height={size.height}
          linkColor={(link) => rgbaColor(linkSourceColor(link, space.color), dark ? 0.52 : 0.42)}
          linkDirectionalArrowColor={(link) => linkSourceColor(link, space.color)}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={0.88}
          linkDirectionalParticleColor={(link) => mixHexColor(linkSourceColor(link, space.color), "#ffffff", 0.24)}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.15}
          linkLabel={(link) => link.relation}
          linkOpacity={0.58}
          linkWidth={1.05}
          nodeLabel={(node) => `<strong>${escapeHtml(node.title)}</strong><br><small>${escapeHtml(node.type)}</small>`}
          nodeThreeObject={makeNodeObject}
          nodeThreeObjectExtend={false}
          numDimensions={3}
          onBackgroundClick={() => onSelectNode("")}
          onEngineStop={() => {
            if (hasFittedRef.current) return;
            window.requestAnimationFrame(() => {
              if (resetView()) hasFittedRef.current = true;
            });
          }}
          onNodeClick={focusNode}
          ref={graphRef}
          rendererConfig={{ alpha: true, antialias: true }}
          showNavInfo={false}
          showPointerCursor
          warmupTicks={45}
          width={size.width}
        />
      )}

      {visibleNodes.length === 0 && (
        <div className="theme-muted absolute inset-0 z-[3] flex flex-col items-center justify-center text-center">
          <p className="text-sm font-bold">没有匹配的知识节点</p>
          <p className="mt-1 text-xs">换一个关键词，或插入新的知识。</p>
        </div>
      )}

      <div className="knowledge-graph-controls" onClick={(event) => event.stopPropagation()}>
        <button aria-label="复位图谱视角" onClick={resetView} title="复位视角" type="button">
          <Focus size={15} />
          <span>复位</span>
        </button>
        <button
          aria-label={autoRotate ? "停止自动旋转" : "开启自动旋转"}
          aria-pressed={autoRotate}
          className={autoRotate ? "is-active" : ""}
          onClick={() => setAutoRotate((value) => !value)}
          title={autoRotate ? "停止自动旋转" : "自动旋转"}
          type="button"
        >
          <Orbit size={15} />
          <span>环绕</span>
        </button>
      </div>

      <div className="knowledge-graph-hint">拖动旋转 · 滚轮缩放 · 右键平移 · 点击查看节点</div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] || character);
}

function stableAngle(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 628) / 100;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function nodeColor(key: string, fallback: string) {
  if (!key.trim()) return fallback;
  return NODE_PALETTE[stableHash(key) % NODE_PALETTE.length];
}

function assignAdjacentColors(nodes: KnowledgeNode[], edges: KnowledgeSpace["edges"]) {
  const neighbors = new Map<string, Set<string>>();
  nodes.forEach((node) => neighbors.set(node.id, new Set()));
  edges.forEach((edge) => {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  });

  const colorByNode = new Map<string, string>();
  const orderedNodes = [...nodes].sort((left, right) => {
    const degreeDifference = (neighbors.get(right.id)?.size ?? 0) - (neighbors.get(left.id)?.size ?? 0);
    return degreeDifference || left.id.localeCompare(right.id);
  });

  orderedNodes.forEach((node) => {
    const unavailable = new Set(
      [...(neighbors.get(node.id) ?? [])]
        .map((neighborId) => colorByNode.get(neighborId))
        .filter((color): color is string => Boolean(color)),
    );
    const offset = stableHash(node.id) % NODE_PALETTE.length;
    const candidates = NODE_PALETTE.map((_, index) => NODE_PALETTE[(index + offset) % NODE_PALETTE.length]);
    colorByNode.set(node.id, candidates.find((color) => !unavailable.has(color)) ?? NODE_PALETTE[offset]);
  });

  return colorByNode;
}

function compactTitle(value: string) {
  const characters = Array.from(value.trim());
  return characters.length <= 5 ? characters.join("") : `${characters.slice(0, 4).join("")}…`;
}

function linkSourceColor(link: GraphLink, fallback: string) {
  const source = link.source as string | GraphNode;
  return typeof source === "object" && source?.color ? source.color : fallback;
}

function finiteCoordinate(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mixHexColor(color: string, target: string, amount: number) {
  const from = parseHexColor(color);
  const to = parseHexColor(target);
  if (!from || !to) return color;
  const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
  return `#${[mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2])]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbaColor(color: string, alpha: number) {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((character) => character.repeat(2)).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function isValidBounds(value: unknown): value is { x: [number, number]; y: [number, number]; z: [number, number] } {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<Record<"x" | "y" | "z", unknown>>;
  return [bounds.x, bounds.y, bounds.z].every((axis) => (
    Array.isArray(axis)
    && axis.length === 2
    && axis.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  ));
}
