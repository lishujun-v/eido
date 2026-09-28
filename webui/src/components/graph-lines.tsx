"use client";

import { Activity, AlertCircle, ArrowLeft, Check, Circle, ExternalLink, FileText, GitFork, ImageIcon, Keyboard, Loader2, LogIn, LogOut, Play, RefreshCw, Scale, Send, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GraphNode = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status?: "idle" | "running" | "completed" | "failed";
  config?: { prompt?: string; [key: string]: unknown };
};

type GraphEdge = { id?: string; source: string; target: string; label?: string };

type GraphLine = {
  id: string;
  name: string;
  description?: string;
  status?: "draft" | "active" | "completed" | "failed";
  nodes: GraphNode[];
  edges: GraphEdge[];
  updated_at?: string;
};

type FactoryChangedDetail = {
  action?: "create" | "update" | "delete" | "changed";
  graphId?: string;
};

type PositionedNode = GraphNode & { x: number; y: number; band: number; order: number };

type GraphNodeEvent = {
  type: string;
  ts?: string;
  message?: string;
  tool?: string;
  arguments?: unknown;
  result?: unknown;
  output?: unknown;
  content?: string;
  error?: string;
  [key: string]: unknown;
};

type GraphRun = {
  id: string;
  status: "running" | "waiting" | "completed" | "failed";
  node_states: Record<string, { status: GraphNode["status"] | "waiting"; input?: unknown; output?: unknown; error?: string }>;
  node_events?: Record<string, GraphNodeEvent[]>;
  node_live_outputs?: Record<string, string>;
  waiting_node_id?: string | null;
  output?: unknown;
  error?: string;
  input?: unknown;
  created_at?: string;
  updated_at?: string;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 116;
const GAP_X = 96;
const GAP_Y = 48;
const BOARD_PADDING = 54;
const BAND_GAP = 72;

export function GraphLines({ agentId }: { agentId?: string }) {
  const [graphs, setGraphs] = useState<GraphLine[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [interaction, setInteraction] = useState("");
  const [run, setRun] = useState<GraphRun | null>(null);
  const [runHistory, setRunHistory] = useState<GraphRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [detailWidth, setDetailWidth] = useState(0);

  const loadGraphs = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else { setLoading(true); setError(""); }
    try {
      const response = await fetch("/api/graphlines", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "无法读取 Factory。");
      const next = Array.isArray(data?.graphs) ? data.graphs.filter(isGraphLine) : [];
      setGraphs(next);
      setSelectedId((current) => next.some((graph: GraphLine) => graph.id === current) ? current : "");
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "无法读取 Factory。");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const refreshChangedGraph = useCallback(async (detail: FactoryChangedDetail) => {
    if (!detail.graphId || detail.action === "create" || detail.action === "delete") {
      await loadGraphs(true);
      return;
    }

    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/graphlines?graphId=${encodeURIComponent(detail.graphId)}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !isGraphLine(data?.graph)) {
        throw new Error(data?.error || "无法刷新业务线。");
      }
      setGraphs((current) => {
        const index = current.findIndex((item) => item.id === data.graph.id);
        if (index < 0) return [data.graph, ...current];
        return current.map((item) => item.id === data.graph.id ? data.graph : item);
      });
      setError("");
    } catch {
      // Fall back to a full refresh if the targeted graph was moved or replaced.
      await loadGraphs(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadGraphs]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadGraphs(); }, 0);
    const refresh = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? (event.detail as FactoryChangedDetail | undefined)
        : undefined;
      void refreshChangedGraph(detail ?? {});
    };
    window.addEventListener("eido:factory-changed", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("eido:factory-changed", refresh);
    };
  }, [loadGraphs, refreshChangedGraph]);

  const graph = graphs.find((item) => item.id === selectedId);
  const loadRunHistory = useCallback(async (graphId: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/graphlines?graphId=${encodeURIComponent(graphId)}&runs=1&agentId=${encodeURIComponent(agentId || "")}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "无法读取运行记录。");
      setRunHistory(Array.isArray(data?.runs) ? data.runs.filter(isGraphRun) : []);
    } catch (historyError) {
      setRunHistory([]);
      setError(historyError instanceof Error ? historyError.message : "无法读取运行记录。");
    } finally {
      setHistoryLoading(false);
    }
  }, [agentId]);

  const removeRunHistory = useCallback(async (runId?: string) => {
    if (!graph) return;
    try {
      const response = await fetch("/api/graphlines", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graphId: graph.id, agentId, runId, clear: !runId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "无法删除运行记录。");
      const removed = new Set<string>(Array.isArray(data?.removedRunIds) ? data.removedRunIds : runId ? [runId] : runHistory.map((item) => item.id));
      setRunHistory((current) => current.filter((item) => !removed.has(item.id)));
      if (run && removed.has(run.id)) { setRun(null); setSelectedNodeId(""); }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "无法删除运行记录。");
    }
  }, [agentId, graph, run, runHistory]);

  const graphId = graph?.id;
  useEffect(() => {
    if (!graphId) return;
    const timer = window.setTimeout(() => { void loadRunHistory(graphId); }, 0);
    return () => window.clearTimeout(timer);
  }, [graphId, loadRunHistory]);
  useEffect(() => {
    const element = detailRef.current;
    if (!element) return;
    const updateWidth = () => setDetailWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [graph]);

  useEffect(() => {
    if (run?.status !== "running" || !runStartedAt) return;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - runStartedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [run?.status, runStartedAt]);

  const layout = useMemo(() => graph ? layoutGraph(graph, detailWidth) : null, [graph, detailWidth]);

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    setAttachmentNames((current) => [...current, ...Array.from(files, (file) => file.name)].slice(-8));
  };

  const execute = async (resume = false) => {
    if (!graph || running) return;
    setRunning(true); setError("");
    setRunStartedAt(new Date().getTime()); setElapsedSeconds(0);
    if (resume && run?.waiting_node_id) {
      setRun({ ...run, status: "running", node_states: { ...run.node_states, [run.waiting_node_id]: { ...run.node_states[run.waiting_node_id], status: "running" } } });
    } else if (!resume) {
      const roots = new Set(graph.nodes.filter((node) => !graph.edges.some((edge) => edge.target === node.id)).map((node) => node.id));
      setRun({ id: "pending", status: "running", node_states: Object.fromEntries(graph.nodes.map((node) => [node.id, { status: roots.has(node.id) ? "running" : "idle" }])) });
    }
    try {
      const response = await fetch("/api/graphlines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ graphId: graph.id, agentId, input, runId: resume ? run?.id : undefined, interactionResponse: resume ? interaction : undefined }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Graph 运行失败。");
      setRun(data.run); setInteraction("");
      setRunHistory((current) => [data.run as GraphRun, ...current.filter((item) => item.id !== data.run?.id)]);
      if (data.run?.status === "running") await subscribeRun(graph.id, data.run.id);
    } catch (runError) { setError(runError instanceof Error ? runError.message : "Graph 运行失败。"); }
    finally { setRunning(false); }
  };

  const subscribeRun = async (graphId: string, runId: string) => {
    try {
      await streamRunEvents(graphId, runId);
    } catch {
      await pollRun(graphId, runId);
    }
  };

  const streamRunEvents = (graphId: string, runId: string) => {
    return new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/graphlines/events?graphId=${encodeURIComponent(graphId)}&runId=${encodeURIComponent(runId)}&agentId=${encodeURIComponent(agentId || "")}`);
      let settled = false;
      const settle = (ok: boolean, error?: string) => {
        if (settled) return;
        settled = true;
        source.close();
        if (ok) resolve();
        else reject(new Error(error || "实时状态流连接中断。"));
      };
      source.onmessage = (message) => {
        let data: Record<string, unknown>;
        try { data = JSON.parse(message.data); } catch { return; }
        if (data.type === "snapshot") {
          if (isRecord(data.run)) {
            const nextRun = data.run as unknown as GraphRun;
            setRun(nextRun);
            setRunHistory((current) => current.map((item) => item.id === nextRun.id ? nextRun : item));
          }
        } else if (data.type === "event") {
          const nodeId = typeof data.node_id === "string" ? data.node_id : "";
          if (nodeId && isRecord(data.event)) {
            const nodeEvent = data.event as unknown as GraphNodeEvent;
            applyNodeEvent(nodeId, nodeEvent);
            if (nodeEvent.type === "node.waiting") {
              setRun((current) => current ? { ...current, status: "waiting", waiting_node_id: nodeId } : current);
            }
          }
        } else if (data.type === "done") {
          if (isRecord(data.run)) {
            const nextRun = data.run as unknown as GraphRun;
            setRun(nextRun);
            setRunHistory((current) => current.map((item) => item.id === nextRun.id ? nextRun : item));
          }
          settle(true);
        } else if (data.type === "error") {
          settle(false, typeof data.error === "string" ? data.error : "实时状态流错误。");
        }
      };
      source.onerror = () => settle(false, "实时状态流连接中断。");
    });
  };

  const applyNodeEvent = (nodeId: string, event: GraphNodeEvent) => {
    if (event.type === "node.started" || event.type === "node.waiting") {
      setSelectedNodeId(nodeId);
    }
    setRun((current) => {
      if (!current) return current;
      const nodeEvents = { ...(current.node_events || {}) };
      nodeEvents[nodeId] = [...(nodeEvents[nodeId] || []), { ...event, ts: event.ts || new Date().toISOString() }];
      const liveOutputs = { ...(current.node_live_outputs || {}) };
      if (event.type === "delta" && typeof event.content === "string") {
        liveOutputs[nodeId] = `${liveOutputs[nodeId] || ""}${event.content}`.slice(-12_000);
      }
      const nodeStates = { ...current.node_states };
      const state = { ...(nodeStates[nodeId] || { status: "idle" as const }) };
      if (event.type === "node.started") {
        state.status = "running";
      } else if (event.type === "node.completed") {
        state.status = "completed";
        state.output = event.output ?? state.output;
      } else if (event.type === "node.failed") {
        state.status = "failed";
        state.error = typeof event.error === "string" ? event.error : state.error;
      } else if (event.type === "node.waiting") {
        state.status = "waiting";
      }
      nodeStates[nodeId] = state;
      return { ...current, node_events: nodeEvents, node_live_outputs: liveOutputs, node_states: nodeStates };
    });
  };

  const pollRun = async (graphId: string, runId: string) => {
    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const response = await fetch("/api/graphlines", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ graphId, runId, agentId }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "无法读取 Graph 运行状态。");
      setRun(data.run);
      if (data.run?.status !== "running") return;
    }
  };

  return (
    <section className="graphlines-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border">
      <header className="theme-panel flex h-[52px] shrink-0 items-center gap-3 border-x-0 border-t-0 px-4">
        {graph ? <>
          <button aria-label="返回业务线列表" className="theme-muted flex size-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-heading)]" onClick={() => { setSelectedId(""); setRun(null); setRunHistory([]); setAttachmentNames([]); setInteraction(""); setSelectedNodeId(""); }} title="返回业务线列表" type="button"><ArrowLeft size={17} /></button>
          <span className="h-4 w-px bg-[var(--app-border)]" />
          <span className="theme-primary-soft flex size-7 shrink-0 items-center justify-center rounded-md"><GitFork size={14} /></span>
          <div className="flex min-w-0 items-baseline gap-2"><h2 className="theme-heading truncate text-sm font-semibold">{graph.name}</h2><GraphStatus status={run ? run.status === "running" || run.status === "waiting" ? "active" : run.status : graph.status} /></div>
          <span className="theme-muted hidden shrink-0 text-[11px] lg:inline">{graph.nodes.length} 节点 · {graph.edges.length} 条连接</span>
        </> : <><span className="theme-primary-soft flex size-7 shrink-0 items-center justify-center rounded-md"><GitFork size={14} /></span><h2 className="theme-heading text-sm font-semibold">Factory</h2></>}
        <button aria-label="刷新 Factory" className="theme-muted ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-heading)]" disabled={loading || refreshing} onClick={() => void loadGraphs(true)} title="刷新" type="button"><RefreshCw className={loading || refreshing ? "animate-spin" : ""} size={15} /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {loading && graphs.length === 0 ? (
          <CenteredState icon={<Loader2 className="animate-spin" size={24} />} title="正在载入 Factory" />
        ) : error ? (
          <CenteredState icon={<AlertCircle size={24} />} title={error} />
        ) : graphs.length === 0 ? (
          <CenteredState icon={<GitFork size={28} />} title="还没有业务线" description="在右侧对话中告诉 SiinX 你的业务目标并让它创建 Graph，创建结果会保存在 graphs 目录并作为业务线展示在这里。" />
        ) : !graph ? (
          <GraphList graphs={graphs} onSelect={(nextGraph) => { setSelectedId(nextGraph.id); setRun(null); setRunHistory([]); setAttachmentNames([]); setInteraction(""); setSelectedNodeId(""); }} />
        ) : layout ? (
          <div className="w-full min-w-[680px]">
            <div className="theme-soft mb-4 rounded-[14px] border p-3">
              <div className="grid min-w-[980px] grid-cols-[2fr_2fr_1fr] items-stretch gap-4">
                <RunHistoryRail history={runHistory} loading={historyLoading} onClear={() => void removeRunHistory()} onDelete={(runId) => void removeRunHistory(runId)} selectedRunId={run?.id} onSelect={(savedRun) => { setRun(savedRun); setSelectedNodeId(""); setRunStartedAt(savedRun.status === "running" && savedRun.created_at ? new Date(savedRun.created_at).getTime() : null); setElapsedSeconds(0); if (savedRun.status === "running") void subscribeRun(graph.id, savedRun.id); }} />
                <div className="min-w-0 border-l border-[var(--app-border)] pl-4">
                  <div className="relative">
                    {run?.status === "waiting" ? <input className="theme-input h-10 w-full rounded-[10px] border py-2 pl-3 pr-16 text-[12px] outline-none" onChange={(event) => setInteraction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && interaction.trim()) void execute(true); }} placeholder={graph.nodes.find((node) => node.id === run.waiting_node_id)?.config?.prompt || "请输入交互内容后继续"} value={interaction} /> : <textarea className="theme-input min-h-10 w-full resize-none rounded-[10px] border py-2.5 pl-3 pr-16 text-[12px] outline-none" onChange={(event) => setInput(event.target.value)} placeholder="输入任务内容，或添加文档、图片作为参考…" rows={1} value={input} />}
                    <button aria-label={run?.status === "waiting" ? "继续运行" : "运行"} className="theme-button absolute right-1 top-1 flex h-8 items-center gap-1 rounded-[8px] border px-2 text-[10px] font-bold" disabled={run?.status === "waiting" ? !interaction.trim() || running : running} onClick={() => void execute(run?.status === "waiting")} type="button">{running ? <Loader2 className="animate-spin" size={14} /> : run?.status === "waiting" ? <Send size={14} /> : <Play size={14} />}{run?.status === "waiting" ? "继续" : "运行"}</button>
                  </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input accept=".txt,.md,.pdf,.doc,.docx" className="sr-only" onChange={(event) => addAttachments(event.target.files)} ref={documentInputRef} type="file" />
                      <input accept="image/*" className="sr-only" onChange={(event) => addAttachments(event.target.files)} ref={imageInputRef} type="file" />
                      <button className="theme-button flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-[10px] font-semibold" onClick={() => documentInputRef.current?.click()} type="button"><FileText size={12} />文档</button>
                      <button className="theme-button flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-[10px] font-semibold" onClick={() => imageInputRef.current?.click()} type="button"><ImageIcon size={12} />图片</button>
                      {attachmentNames.length > 0 && <span className="theme-muted ml-1 max-w-[160px] truncate text-[10px]">已选 {attachmentNames.length} 个附件</span>}
                    </div>
                </div>
                <div className="theme-muted flex min-w-0 flex-col justify-center border-l border-[var(--app-border)] pl-4 text-[11px]">
                  <div className="flex items-center gap-2 font-semibold">{run?.status === "running" ? <Loader2 className="animate-spin text-[#6f63d9]" size={14} /> : run?.status === "completed" ? <Check className="text-[#3c9a60]" size={14} /> : run?.status === "failed" ? <AlertCircle className="text-[#c34e5d]" size={14} /> : <Activity size={14} />}<span>{run?.status === "waiting" ? "等待补充输入" : run?.status === "running" ? "正在运行" : run?.status === "completed" ? "运行完成" : run?.status === "failed" ? "运行失败" : "准备运行"}</span></div>
                  <p className="mt-1 line-clamp-2 leading-4">{run?.status === "running" ? `${activeNodeLabel(graph, run) || "Agent"} · 已运行 ${formatElapsed(elapsedSeconds)}` : run?.status === "failed" ? run.error || "请查看失败节点详情" : run?.status === "completed" ? "点击最终节点查看结果" : "运行过程会在这里实时反馈"}</p>
                </div>
              </div>
            </div>
            <div className="min-w-[680px]" ref={detailRef}>
                <div className="graphlines-board relative overflow-hidden rounded-[18px] border border-[var(--app-border)]" style={{ width: "100%", height: layout.height }}>
                  <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox={`0 0 ${layout.width} ${layout.height}`}>
                    <defs><marker id="graph-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5"><path d="M0,0 L7,3.5 L0,7 Z" fill="var(--app-muted)" /></marker></defs>
                    {layout.edges.map((edge) => <GraphConnector edge={edge} key={edge.id || `${edge.source}-${edge.target}`} nodeStates={run?.node_states} nodes={layout.nodes} />)}
                  </svg>
                  {layout.nodes.map((node) => <GraphNodeCard error={run?.node_states?.[node.id]?.error} key={node.id} node={{ ...node, status: normalizeRunStatus(run?.node_states?.[node.id]?.status) || node.status }} onSelect={() => setSelectedNodeId(node.id)} output={run?.node_states?.[node.id]?.output} preview={run?.node_live_outputs?.[node.id]} selected={selectedNodeId === node.id} />)}
                </div>
              </div>
            {selectedNodeId && <NodeExecutionDetail node={graph.nodes.find((node) => node.id === selectedNodeId)} preview={run?.node_live_outputs?.[selectedNodeId]} state={run?.node_states?.[selectedNodeId]} events={run?.node_events?.[selectedNodeId]} />}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GraphList({ graphs, onSelect }: { graphs: GraphLine[]; onSelect: (graph: GraphLine) => void }) {
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {graphs.map((graph) => {
          const nodeTypes = Array.from(new Set(graph.nodes.map((node) => node.type).filter(Boolean))).slice(0, 4);
          return (
            <button key={graph.id} className="theme-panel group flex min-h-[172px] flex-col rounded-[18px] border p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--app-primary)] hover:shadow-lg" onClick={() => onSelect(graph)} type="button">
              <div className="flex w-full items-start gap-3">
                <span className="theme-primary-soft flex size-12 shrink-0 items-center justify-center rounded-[14px]"><GitFork size={23} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h3 className="theme-heading truncate text-[16px] font-bold">{graph.name}</h3><GraphStatus status={graph.status} /></div>
                  <span className="theme-muted mt-1 block text-[11px]">{graph.nodes.length} 节点 · {graph.edges.length} 条连接</span>
                </div>
                <ExternalLink className="theme-muted shrink-0 opacity-0 transition group-hover:opacity-100" size={17} />
              </div>
              <p className="theme-muted mt-3 line-clamp-2 text-[12px] leading-5">{graph.description || "暂无描述"}</p>
              <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {nodeTypes.map((type) => <span key={type} className="rounded-full bg-[var(--app-surface-soft)] px-2 py-1 text-[9px] font-bold uppercase text-[var(--app-muted)]">{type}</span>)}
                </div>
                {graph.updated_at && <span className="theme-muted shrink-0 text-[9px]">{formatDate(graph.updated_at)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RunHistoryRail({ history, loading, selectedRunId, onSelect, onDelete, onClear }: { history: GraphRun[]; loading: boolean; selectedRunId?: string; onSelect: (run: GraphRun) => void; onDelete: (runId: string) => void; onClear: () => void }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2"><span className="theme-heading text-[11px] font-bold">最近运行</span><span className="flex items-center gap-2"><span className="theme-muted text-[10px]">{loading ? "载入中" : `${history.length} 条`}</span>{history.length > 0 && <button className="theme-button rounded-[6px] border px-1.5 py-0.5 text-[9px]" onClick={onClear} type="button">清空</button>}</span></div>
      {history.length > 0 ? <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {history.map((item) => <div className="theme-soft relative min-w-[170px] rounded-[9px] border transition hover:border-[var(--app-primary)]" data-selected={item.id === selectedRunId} key={item.id}>
          <button aria-label="删除运行记录" className="theme-muted absolute right-1.5 top-1.5 rounded p-0.5 hover:bg-black/5" onClick={() => onDelete(item.id)} type="button"><X size={11} /></button>
          <button className="w-full px-2.5 py-2 pr-7 text-left text-[10px]" onClick={() => onSelect(item)} type="button">
          <div className="flex items-center justify-between gap-2"><span className="theme-heading font-semibold">{runStatusLabel(item.status)}</span><span className="theme-muted">{formatDate(item.updated_at || item.created_at || "")}</span></div>
          <div className="theme-muted mt-1 truncate">{formatHistoryInput(item.input)}</div>
          </button>
        </div>)}
      </div> : <p className="theme-muted mt-2 text-[10px]">暂无运行记录</p>}
    </div>
  );
}

function GraphNodeCard({ node, output, preview, error, selected, onSelect }: { node: PositionedNode; output?: unknown; preview?: string; error?: string; selected: boolean; onSelect: () => void }) {
  return (
    <button className="graphlines-node absolute rounded-[16px] border p-3 text-left" data-node-status={node.status || "idle"} data-node-type={node.type || "work"} data-selected={selected} onClick={onSelect} style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }} type="button">
      <div className="flex items-start gap-3">
        <NodeTypeIcon type={node.type} />
        <div className="min-w-0 flex-1"><h3 className="theme-heading truncate text-[12px] font-bold">{node.title}</h3><p className="theme-muted mt-1 line-clamp-2 text-[10px] leading-4">{node.description || node.type || "Task node"}</p></div>
        <span className="graphlines-step flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold">{String(node.order + 1).padStart(2, "0")}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {node.type && <span className="theme-primary-soft inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">{node.type}</span>}
        <NodeStatus status={node.status} />
      </div>
      {node.status === "running" && preview && <p className="theme-muted mt-2 line-clamp-3 border-t border-[var(--app-border)] pt-2 text-[9px] leading-4" title={preview}>{preview}</p>}
      {output !== undefined && output !== "" && <p className="theme-muted mt-2 line-clamp-3 border-t border-[var(--app-border)] pt-2 text-[9px] leading-4" title={formatOutput(output)}>{formatOutput(output)}</p>}
      {error && <p className="mt-2 line-clamp-3 border-t border-red-200 pt-2 text-[9px] leading-4 text-red-500" title={error}>{error}</p>}
    </button>
  );
}

function NodeExecutionDetail({ node, state, events, preview }: { node?: GraphNode; state?: GraphRun["node_states"][string]; events?: GraphNodeEvent[]; preview?: string }) {
  if (!node) return null;
  const status = state?.status || "idle";
  const timeline = (events || []).filter((event) => event.type !== "delta");
  const thinking = preview || (events || []).filter((event) => event.type === "delta").map((event) => typeof event.content === "string" ? event.content : "").join("");
  const activeToolStarts = activeToolStartIndexes(timeline);
  return (
    <section className="theme-panel mt-4 rounded-[16px] border p-4">
      <div className="flex items-center gap-2"><NodeStatus status={normalizeRunStatus(status)} /><h3 className="theme-heading text-[13px] font-bold">{node.title}</h3><span className="theme-muted text-[10px]">{statusLabel(status)}</span></div>
      {!state ? <p className="theme-muted mt-3 text-[11px]">该节点在当前运行中尚未执行。</p> : <div className="mt-3 grid grid-cols-2 gap-3">
        <NodeValue title="输入" value={state.input} />
        <NodeValue title="输出" value={state.output} />
        {state.error && <div className="col-span-2"><NodeValue error title="错误" value={state.error} /></div>}
      </div>}
      {(timeline.length > 0 || thinking) && <div className="mt-3">
        <div className="theme-muted mb-2 text-[10px] font-bold">执行过程</div>
        <div className="theme-soft max-h-72 space-y-2 overflow-auto rounded-[12px] border p-3">
          {timeline.map((event, index) => <NodeEventRow active={activeToolStarts.has(index)} event={event} key={index} />)}
          {thinking && <div className="theme-muted whitespace-pre-wrap border-t border-[var(--app-border)] pt-2 text-[11px] leading-5">{thinking}</div>}
        </div>
      </div>}
    </section>
  );
}

function NodeEventRow({ event, active }: { event: GraphNodeEvent; active: boolean }) {
  const tool = typeof event.tool === "string" ? event.tool : "";
  if (event.type === "node.started") return <div className="theme-muted flex items-center gap-2 text-[11px]"><Activity size={11} className="shrink-0" />节点开始执行</div>;
  if (event.type === "node.completed") return <div className="flex items-center gap-2 text-[11px] text-[#3c9a60]"><Check size={11} className="shrink-0" />节点执行完成</div>;
  if (event.type === "node.failed") return <div className="flex items-center gap-2 text-[11px] text-red-500"><AlertCircle size={11} className="shrink-0" />节点执行失败{typeof event.error === "string" && event.error ? `：${event.error}` : ""}</div>;
  if (event.type === "agent.started") return <div className="theme-heading flex items-center gap-2 text-[11px]"><Loader2 size={11} className="shrink-0 animate-spin text-[#6f63d9]" />{event.message || "正在请求 Agent…"}</div>;
  if (event.type === "agent.completed") return <div className="flex items-center gap-2 text-[11px] text-[#3c9a60]"><Check size={11} className="shrink-0" />{event.message || "Agent 已完成"}</div>;
  if (event.type === "agent.failed") return <div className="flex items-center gap-2 text-[11px] text-red-500"><AlertCircle size={11} className="shrink-0" />Agent 失败{typeof event.error === "string" && event.error ? `：${event.error}` : ""}</div>;
  if (event.type === "tool.started") return <div className="theme-heading flex items-center gap-2 text-[11px]">{active ? <Loader2 size={11} className="shrink-0 animate-spin text-[#6f63d9]" /> : <Activity size={11} className="shrink-0 text-[#6f63d9]" />}调用工具 <code className="theme-soft rounded px-1 py-0.5 font-mono text-[10px]">{tool}</code>{formatArguments(event.arguments)}</div>;
  if (event.type === "tool.completed") return <div className="flex items-start gap-2 text-[11px]"><Check size={11} className="mt-0.5 shrink-0 text-[#3c9a60]" />工具 <code className="theme-soft rounded px-1 py-0.5 font-mono text-[10px]">{tool}</code> 完成{event.result !== undefined && event.result !== "" ? <span className="theme-muted line-clamp-3 whitespace-pre-wrap break-words" title={formatOutput(event.result)}>{formatOutput(event.result)}</span> : null}</div>;
  if (event.type === "tool.failed") return <div className="flex items-start gap-2 text-[11px] text-red-500"><AlertCircle size={11} className="mt-0.5 shrink-0" />工具 <code className="theme-soft rounded px-1 py-0.5 font-mono text-[10px]">{tool}</code> 失败{typeof event.error === "string" && event.error ? `：${event.error}` : ""}</div>;
  return null;
}

function formatArguments(value: unknown) {
  if (value === undefined || value === null) return null;
  let text = "";
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch { return null; }
  if (!text || text === "{}") return null;
  return <span className="theme-muted ml-1 font-mono text-[10px]">{text.length > 120 ? `${text.slice(0, 120)}…` : text}</span>;
}

function activeToolStartIndexes(events: GraphNodeEvent[]) {
  const completedByTool = new Map<string, number>();
  const active = new Set<number>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const tool = typeof event.tool === "string" ? event.tool : "";
    if (!tool) continue;
    if (event.type === "tool.completed" || event.type === "tool.failed") {
      completedByTool.set(tool, (completedByTool.get(tool) || 0) + 1);
    } else if (event.type === "tool.started") {
      const completed = completedByTool.get(tool) || 0;
      if (completed > 0) completedByTool.set(tool, completed - 1);
      else active.add(index);
    }
  }
  return active;
}

function activeNodeLabel(graph: GraphLine, run: GraphRun) {
  const active = graph.nodes.find((node) => run.node_states[node.id]?.status === "running");
  return active?.title || "";
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function NodeValue({ title, value, error = false }: { title: string; value: unknown; error?: boolean }) {
  return <div className="theme-soft min-w-0 rounded-[12px] border p-3"><div className={`mb-2 text-[10px] font-bold ${error ? "text-red-500" : "theme-muted"}`}>{title}</div><pre className={`max-h-60 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 ${error ? "text-red-500" : "theme-heading"}`}>{value === undefined || value === "" ? "暂无数据" : formatOutput(value)}</pre></div>;
}

function statusLabel(status: GraphRun["node_states"][string]["status"]) {
  return status === "running" ? "执行中" : status === "waiting" ? "等待输入" : status === "completed" ? "已完成" : status === "failed" ? "执行失败" : "未执行";
}

function normalizeRunStatus(status?: GraphRun["node_states"][string]["status"]): GraphNode["status"] | undefined {
  return status === "waiting" ? "running" : status;
}

function GraphConnector({ edge, nodes, nodeStates }: { edge: GraphEdge; nodes: PositionedNode[]; nodeStates?: GraphRun["node_states"] }) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return null;
  let path: string;
  if (source.band !== target.band) {
    const x1 = source.x + NODE_WIDTH / 2;
    const y1 = source.y + NODE_HEIGHT;
    const x2 = target.x + NODE_WIDTH / 2;
    const y2 = target.y;
    const bend = Math.max(34, (y2 - y1) * .48);
    path = `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  } else {
    const forward = target.x >= source.x;
    const x1 = forward ? source.x + NODE_WIDTH : source.x;
    const x2 = forward ? target.x : target.x + NODE_WIDTH;
    const y1 = source.y + NODE_HEIGHT / 2;
    const y2 = target.y + NODE_HEIGHT / 2;
    const bend = Math.max(36, Math.abs(x2 - x1) * .45);
    path = `M ${x1} ${y1} C ${x1 + (forward ? bend : -bend)} ${y1}, ${x2 + (forward ? -bend : bend)} ${y2}, ${x2} ${y2}`;
  }
  const sourceStatus = nodeStates?.[edge.source]?.status;
  const targetStatus = nodeStates?.[edge.target]?.status;
  const active = sourceStatus === "completed" && (targetStatus === "running" || targetStatus === "waiting");
  const completed = sourceStatus === "completed" && targetStatus === "completed";
  const failed = targetStatus === "failed";
  const stroke = failed ? "#c34e5d" : active ? "#6f63d9" : completed ? "#3c9a60" : "var(--app-muted-strong)";
  return <g className="graphlines-connector" data-active={active}><path d={path} fill="none" stroke="var(--app-bg-soft)" strokeWidth="7" /><path className={active ? "graphlines-flow-path" : ""} d={path} fill="none" markerEnd="url(#graph-arrow)" stroke={stroke} strokeOpacity={active || completed || failed ? "1" : ".45"} strokeWidth={active ? "2.75" : "1.75"} /></g>;
}

function NodeStatus({ status = "idle" }: { status?: GraphNode["status"] }) {
  if (status === "running") return <Loader2 className="shrink-0 animate-spin text-[#6f63d9]" size={13} />;
  if (status === "completed") return <Check className="shrink-0 text-[#3c9a60]" size={13} strokeWidth={3} />;
  if (status === "failed") return <AlertCircle className="shrink-0 text-[#c34e5d]" size={13} />;
  return <Circle className="theme-muted shrink-0" size={9} />;
}

function NodeTypeIcon({ type }: { type?: string }) {
  const className = "theme-primary-soft flex size-7 shrink-0 items-center justify-center rounded-[8px]";
  if (type === "input") return <span className={className} title="输入节点"><LogIn size={14} /></span>;
  if (type === "output") return <span className={className} title="输出节点"><LogOut size={14} /></span>;
  if (type === "condition") return <span className={className} title="条件节点"><Scale size={14} /></span>;
  if (type === "interaction") return <span className={className} title="交互节点"><Keyboard size={14} /></span>;
  return <span className={className} title="Work 节点"><Wrench size={14} /></span>;
}

function GraphStatus({ status = "draft" }: { status?: GraphLine["status"] }) {
  const label = status === "active" ? "运行中" : status === "completed" ? "已完成" : status === "failed" ? "失败" : "草稿";
  return <span className="theme-soft inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold"><Activity size={10} />{label}</span>;
}

function CenteredState({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return <div className="theme-soft flex h-full min-h-[420px] flex-col items-center justify-center rounded-[18px] border border-dashed px-8 text-center"><span className="theme-primary-soft mb-4 flex size-14 items-center justify-center rounded-[16px]">{icon}</span><h2 className="theme-heading text-[15px] font-bold">{title}</h2>{description && <p className="theme-muted mt-2 max-w-[430px] text-[12px] leading-5">{description}</p>}</div>;
}

function layoutGraph(graph: GraphLine, availableWidth: number) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1));
  const levels = new Map<string, number>();
  const queue = graph.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  queue.forEach((id) => levels.set(id, 0));
  while (queue.length) {
    const id = queue.shift()!;
    edges.filter((edge) => edge.source === id).forEach((edge) => {
      levels.set(edge.target, Math.max(levels.get(edge.target) || 0, (levels.get(id) || 0) + 1));
      incoming.set(edge.target, (incoming.get(edge.target) || 1) - 1);
      if (incoming.get(edge.target) === 0) queue.push(edge.target);
    });
  }
  graph.nodes.forEach((node, index) => { if (!levels.has(node.id)) levels.set(node.id, index); });
  const columns = new Map<number, GraphNode[]>();
  graph.nodes.forEach((node) => { const level = levels.get(node.id) || 0; columns.set(level, [...(columns.get(level) || []), node]); });
  const columnCount = Math.max(1, ...columns.keys()) + 1;
  const boardWidth = Math.max(680, availableWidth || 680);
  const maximumColumns = Math.max(1, Math.min(columnCount, Math.floor((boardWidth - BOARD_PADDING * 2 + GAP_X) / (NODE_WIDTH + GAP_X))));
  const bandCount = Math.ceil(columnCount / maximumColumns);
  const columnsPerBand = Math.ceil(columnCount / bandCount);
  const bandRows = Array.from({ length: bandCount }, (_, band) => {
    const start = band * columnsPerBand;
    const end = Math.min(columnCount, start + columnsPerBand);
    return Math.max(1, ...Array.from({ length: end - start }, (_, offset) => columns.get(start + offset)?.length || 0));
  });
  const bandTops: number[] = [];
  bandRows.forEach((rows, band) => {
    bandTops[band] = band === 0 ? BOARD_PADDING : bandTops[band - 1] + bandRows[band - 1] * NODE_HEIGHT + Math.max(0, bandRows[band - 1] - 1) * GAP_Y + BAND_GAP;
  });
  const nodes: PositionedNode[] = [];
  columns.forEach((column, level) => {
    const band = Math.floor(level / columnsPerBand);
    const position = level % columnsPerBand;
    const columnsInBand = Math.min(columnsPerBand, columnCount - band * columnsPerBand);
    const slot = band % 2 === 0 ? position : columnsInBand - 1 - position;
    const rowWidth = columnsInBand * NODE_WIDTH + Math.max(0, columnsInBand - 1) * GAP_X;
    const rowLeft = Math.max(BOARD_PADDING, (boardWidth - rowWidth) / 2);
    const offset = (bandRows[band] - column.length) * (NODE_HEIGHT + GAP_Y) / 2;
    column.forEach((node, row) => nodes.push({ ...node, band, order: graph.nodes.findIndex((item) => item.id === node.id), x: rowLeft + slot * (NODE_WIDTH + GAP_X), y: bandTops[band] + offset + row * (NODE_HEIGHT + GAP_Y) }));
  });
  const lastBand = bandCount - 1;
  const contentHeight = bandTops[lastBand] + bandRows[lastBand] * NODE_HEIGHT + Math.max(0, bandRows[lastBand] - 1) * GAP_Y + BOARD_PADDING;
  return { nodes, edges, width: boardWidth, height: Math.max(460, contentHeight) };
}

function isGraphLine(value: unknown): value is GraphLine {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<GraphLine>;
  return typeof graph.id === "string" && typeof graph.name === "string" && Array.isArray(graph.nodes) && Array.isArray(graph.edges);
}

function isGraphRun(value: unknown): value is GraphRun {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.status === "string" && isRecord(value.node_states);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function runStatusLabel(status: GraphRun["status"]) {
  return status === "completed" ? "已完成" : status === "failed" ? "失败" : status === "waiting" ? "等待输入" : "执行中";
}

function formatHistoryInput(input: unknown) {
  const text = formatOutput(input);
  return text ? `输入：${text.replace(/\s+/g, " ")}` : "未提供输入";
}

function formatOutput(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
