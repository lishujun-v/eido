"use client";

import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Database,
  GitBranch,
  Link2,
  Loader2,
  Network,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createKnowledgeClient,
  type KnowledgeNode,
  type KnowledgeRetrievalResult,
  type KnowledgeSearchMode,
  type KnowledgeSearchResult,
  type KnowledgeSpace,
} from "@backend/knowledge/sdk";

type AgentOption = { id: string; name: string };

const knowledgeClient = createKnowledgeClient();

const KnowledgeGraph3D = dynamic(
  () => import("./knowledge-graph-3d").then((module) => module.KnowledgeGraph3D),
  { ssr: false },
);

const emptyNodeDraft = { title: "", type: "知识点", summary: "", content: "", tags: "", aliases: "" };

export function KnowledgeWorkspace({ agents, active = true }: { agents: AgentOption[]; active?: boolean }) {
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [creatingNode, setCreatingNode] = useState(false);
  const [creatingEdge, setCreatingEdge] = useState(false);
  const [retrievalOpen, setRetrievalOpen] = useState(false);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalScope, setRetrievalScope] = useState<"all" | "current">("all");
  const [retrievalMode, setRetrievalMode] = useState<KnowledgeSearchMode>("hybrid");
  const [retrievalResult, setRetrievalResult] = useState<KnowledgeRetrievalResult | null>(null);
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState("");
  const [spaceDraft, setSpaceDraft] = useState({ name: "", domain: "", description: "", color: "#2b79e8" });
  const [nodeDraft, setNodeDraft] = useState(emptyNodeDraft);
  const [edgeDraft, setEdgeDraft] = useState({ source: "", target: "", relation: "关联" });

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0] ?? null;
  const selectedNode = selectedSpace?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const loadSpaces = useCallback(async (search = "") => {
    const data = await knowledgeClient.list(search);
    const nextSpaces = Array.isArray(data.spaces) ? data.spaces : [];
    setSpaces(nextSpaces);
    setResults(Array.isArray(data.results) ? data.results : []);
    setSelectedSpaceId((current) => nextSpaces.some((space) => space.id === current) ? current : nextSpaces[0]?.id || "");
  }, []);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      loadSpaces()
        .then(() => { if (current) setError(""); })
        .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "读取知识库失败。"); })
        .finally(() => { if (current) setLoading(false); });
    }, 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [loadSpaces]);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      loadSpaces(query)
        .then(() => { if (current) setError(""); })
        .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "检索失败。"); });
    }, query.trim() ? 220 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [loadSpaces, query]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      loadSpaces(query)
        .then(() => setError(""))
        .catch((reason) => setError(reason instanceof Error ? reason.message : "读取知识库失败。"));
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [active, loadSpaces, query]);

  const visibleNodes = useMemo(() => {
    if (!selectedSpace) return [];
    if (!query.trim()) return selectedSpace.nodes;
    const ids = new Set(results.filter((result) => result.spaceId === selectedSpace.id).map((result) => result.node.id));
    return selectedSpace.nodes.filter((node) => ids.has(node.id));
  }, [query, results, selectedSpace]);

  async function mutate<T>(operation: () => Promise<T>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await operation();
      await loadSpaces(query);
      return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存知识库失败。");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createSpace() {
    const data = await mutate(() => knowledgeClient.createSpace(spaceDraft));
    if (!data?.space) return;
    setSelectedSpaceId(data.space.id);
    setSpaceDraft({ name: "", domain: "", description: "", color: "#2b79e8" });
    setCreatingSpace(false);
    setNotice("知识空间已创建。");
  }

  async function createNode() {
    if (!selectedSpace) return;
    const data = await mutate(() => knowledgeClient.createNode(selectedSpace.id, {
      ...nodeDraft,
      tags: splitList(nodeDraft.tags),
      aliases: splitList(nodeDraft.aliases),
    }));
    if (!data?.node) return;
    setSelectedNodeId(data.node.id);
    setNodeDraft(emptyNodeDraft);
    setCreatingNode(false);
    setNotice("知识节点已插入图谱。");
  }

  async function createEdge() {
    if (!selectedSpace) return;
    const data = await mutate(() => knowledgeClient.createEdge(selectedSpace.id, edgeDraft));
    if (!data?.edge) return;
    setEdgeDraft({ source: "", target: "", relation: "关联" });
    setCreatingEdge(false);
    setNotice("知识关系已建立。");
  }

  async function updateAgents(agentIds: string[]) {
    if (!selectedSpace) return;
    const data = await mutate(() => knowledgeClient.updateSpace(selectedSpace.id, { agentIds }));
    if (data?.space) setNotice("专家的知识库权限已更新。");
  }

  async function removeSpace() {
    if (!selectedSpace || !window.confirm(`确定删除“${selectedSpace.name}”及其中的全部知识吗？`)) return;
    const data = await mutate(() => knowledgeClient.deleteSpace(selectedSpace.id));
    if (data?.deleted) setNotice("知识空间已删除。");
  }

  async function removeNode(node: KnowledgeNode) {
    if (!selectedSpace || !window.confirm(`确定删除知识节点“${node.title}”吗？关联关系也会一并移除。`)) return;
    const data = await mutate(() => knowledgeClient.deleteNode(selectedSpace.id, node.id));
    if (data?.space) { setSelectedNodeId(""); setNotice("知识节点已删除。"); }
  }

  async function searchKnowledge() {
    const nextQuery = retrievalQuery.trim();
    if (!nextQuery) {
      setRetrievalError("请输入想查找的知识内容。");
      return;
    }
    setRetrievalLoading(true);
    setRetrievalError("");
    try {
      const data = await knowledgeClient.search({
        query: nextQuery,
        mode: retrievalMode,
        topK: 12,
        maxHops: retrievalMode === "graph" ? 1 : 0,
        ...(retrievalScope === "current" && selectedSpace ? { spaceIds: [selectedSpace.id] } : {}),
      });
      setRetrievalResult(data);
    } catch (reason) {
      setRetrievalError(reason instanceof Error ? reason.message : "知识检索失败，请稍后重试。");
      setRetrievalResult(null);
    } finally {
      setRetrievalLoading(false);
    }
  }

  function openRetrieval() {
    setCreatingNode(false);
    setCreatingEdge(false);
    setRetrievalOpen(true);
    setRetrievalError("");
  }

  return (
    <section className="capability-page knowledge-workspace relative flex min-h-0 min-w-0 overflow-hidden rounded-[24px] border">
      <aside className="knowledge-spaces-panel relative z-[2] flex w-[286px] shrink-0 flex-col border-r border-[var(--app-border)]">
        <div className="px-5 pb-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="capability-hero__icon !size-11 !rounded-[14px]"><Network size={21} /></span>
              <div><h1 className="theme-heading text-[18px] font-extrabold tracking-[-0.025em]">知识库</h1><p className="theme-muted mt-0.5 text-[10px] font-semibold">专家的领域知识网络</p></div>
            </div>
            <button aria-label="新建知识空间" className="knowledge-icon-button" onClick={() => setCreatingSpace((value) => !value)} title="新建知识空间" type="button"><Plus size={17} /></button>
          </div>
          <label className="capability-search mt-5 flex h-10 items-center gap-2 rounded-[12px] border px-3">
            <Search className="theme-muted shrink-0" size={16} />
            <input className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-none placeholder:text-[var(--app-muted)]" onChange={(event) => setQuery(event.target.value)} placeholder="检索全部知识…" type="search" value={query} />
            {query && <button aria-label="清除检索" className="theme-muted" onClick={() => setQuery("")} type="button"><X size={14} /></button>}
          </label>
        </div>

        {creatingSpace && (
          <div className="knowledge-create-space mx-4 mb-3 space-y-2 rounded-[14px] border p-3">
            <input autoFocus className="knowledge-field h-9" onChange={(event) => setSpaceDraft((value) => ({ ...value, name: event.target.value }))} placeholder="知识空间名称" value={spaceDraft.name} />
            <input className="knowledge-field h-9" onChange={(event) => setSpaceDraft((value) => ({ ...value, domain: event.target.value }))} placeholder="领域，例如：金融" value={spaceDraft.domain} />
            <textarea className="knowledge-field min-h-16 resize-none py-2" onChange={(event) => setSpaceDraft((value) => ({ ...value, description: event.target.value }))} placeholder="描述这个空间收录什么知识" value={spaceDraft.description} />
            <div className="flex items-center gap-2">
              <input aria-label="空间颜色" className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent" onChange={(event) => setSpaceDraft((value) => ({ ...value, color: event.target.value }))} type="color" value={spaceDraft.color} />
              <button className="theme-primary-bg ml-auto flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold text-white disabled:opacity-50" disabled={saving || !spaceDraft.name.trim()} onClick={createSpace} type="button">{saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}创建</button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {loading && <div className="theme-muted flex items-center justify-center gap-2 py-10 text-xs"><Loader2 className="animate-spin" size={16} />正在读取图谱</div>}
          {!loading && spaces.map((space) => {
            const matchCount = query ? results.filter((result) => result.spaceId === space.id).length : space.nodes.length;
            return <button aria-current={selectedSpace?.id === space.id ? "page" : undefined} className="knowledge-space-row group flex w-full items-center gap-3 rounded-[13px] px-3 py-3 text-left" key={space.id} onClick={() => {
              setSelectedSpaceId(space.id);
              setSelectedNodeId("");
              setCreatingNode(false);
              setCreatingEdge(false);
              loadSpaces(query).then(() => setError("")).catch((reason) => setError(reason instanceof Error ? reason.message : "读取知识库失败。"));
            }} type="button">
              <span className="knowledge-space-glyph flex size-10 shrink-0 items-center justify-center rounded-[12px]" style={{ "--space-color": space.color } as React.CSSProperties}><BookOpen size={18} /></span>
              <span className="min-w-0 flex-1"><span className="theme-heading block truncate text-[13px] font-bold">{space.name}</span><span className="theme-muted mt-0.5 block truncate text-[10px] font-semibold">{space.domain} · {matchCount} 个节点</span></span>
              <ChevronRight className="theme-muted opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" size={15} />
            </button>;
          })}
        </div>
        <div className="theme-muted border-t border-[var(--app-border)] px-5 py-4 text-[10px] font-semibold leading-4"><Database className="mb-2" size={15} />知识以节点与关系存储，可被多个专家共享检索。</div>
      </aside>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {selectedSpace ? (
          <>
            <header className="knowledge-toolbar flex shrink-0 items-center gap-4 border-b border-[var(--app-border)] px-6 py-4">
              <span className="knowledge-domain-mark" style={{ background: selectedSpace.color }} />
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="theme-heading truncate text-[20px] font-extrabold tracking-[-0.03em]">{selectedSpace.name}</h2><span className="capability-count">{selectedSpace.nodes.length} 节点 · {selectedSpace.edges.length} 关系</span></div><p className="theme-muted mt-1 truncate text-[11px] font-semibold">{selectedSpace.description}</p></div>
              <button className="knowledge-action-button" onClick={openRetrieval} type="button"><Sparkles size={15} />检索知识</button>
              <button className="knowledge-action-button" disabled={selectedSpace.nodes.length < 2} onClick={() => { setCreatingEdge((value) => !value); setCreatingNode(false); }} type="button"><Link2 size={15} />建立关系</button>
              <button className="knowledge-action-button is-primary" onClick={() => { setCreatingNode((value) => !value); setCreatingEdge(false); }} type="button"><Plus size={15} />插入知识</button>
              <button aria-label="删除知识空间" className="knowledge-icon-button is-danger" onClick={removeSpace} title="删除知识空间" type="button"><Trash2 size={16} /></button>
            </header>

            {(error || notice) && <div className={`mx-6 mt-4 rounded-[12px] border px-4 py-2.5 text-[11px] font-semibold ${error ? "knowledge-message-error" : "knowledge-message-success"}`}>{error || notice}</div>}

            <div className="flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <KnowledgeGraph3D active={active} space={selectedSpace} visibleNodes={visibleNodes} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
                {query && <div className="knowledge-search-summary absolute left-5 top-5 rounded-full border px-3 py-1.5 text-[10px] font-bold">找到 {visibleNodes.length} 个匹配节点</div>}
                {retrievalOpen && <KnowledgeRetrievalPanel
                  loading={retrievalLoading}
                  error={retrievalError}
                  mode={retrievalMode}
                  query={retrievalQuery}
                  result={retrievalResult}
                  scope={retrievalScope}
                  selectedSpace={selectedSpace}
                  onClose={() => setRetrievalOpen(false)}
                  onModeChange={setRetrievalMode}
                  onQueryChange={setRetrievalQuery}
                  onScopeChange={setRetrievalScope}
                  onSearch={searchKnowledge}
                />}
                {creatingNode && <NodeCreatePanel draft={nodeDraft} saving={saving} onChange={setNodeDraft} onClose={() => setCreatingNode(false)} onSave={createNode} />}
                {creatingEdge && <EdgeCreatePanel draft={edgeDraft} nodes={selectedSpace.nodes} saving={saving} onChange={setEdgeDraft} onClose={() => setCreatingEdge(false)} onSave={createEdge} />}
              </div>

              <aside className="knowledge-inspector w-[310px] shrink-0 overflow-y-auto border-l border-[var(--app-border)] p-5">
                {selectedNode ? (
                  <NodeInspector key={selectedNode.id} node={selectedNode} saving={saving} onDelete={() => removeNode(selectedNode)} onSave={async (node) => {
                    const data = await mutate(() => knowledgeClient.updateNode(selectedSpace.id, selectedNode.id, node));
                    if (data?.node) setNotice("知识节点已更新。");
                  }} />
                ) : (
                  <SpaceInspector key={selectedSpace.id} agents={agents} selectedSpace={selectedSpace} saving={saving} onUpdateAgents={updateAgents} />
                )}
              </aside>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center"><Network className="theme-muted" size={42} /><h2 className="theme-heading mt-4 text-lg font-bold">{error ? "知识库暂不可用" : "还没有知识空间"}</h2><p className={`mt-2 max-w-md text-sm ${error ? "text-[#d05d73]" : "theme-muted"}`}>{error || "从左侧创建一个领域知识空间。"}</p></div>
        )}
      </div>
    </section>
  );
}

function KnowledgeRetrievalPanel({
  loading,
  error,
  mode,
  query,
  result,
  scope,
  selectedSpace,
  onClose,
  onModeChange,
  onQueryChange,
  onScopeChange,
  onSearch,
}: {
  loading: boolean;
  error: string;
  mode: KnowledgeSearchMode;
  query: string;
  result: KnowledgeRetrievalResult | null;
  scope: "all" | "current";
  selectedSpace: KnowledgeSpace;
  onClose: () => void;
  onModeChange: (mode: KnowledgeSearchMode) => void;
  onQueryChange: (value: string) => void;
  onScopeChange: (scope: "all" | "current") => void;
  onSearch: () => void;
}) {
  const scopeLabel = scope === "current" ? selectedSpace.name : "全部知识空间";
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);

  useEffect(() => {
    setExpandedMatchKey(null);
  }, [result]);

  return <section aria-label="知识检索" className="knowledge-retrieval-panel absolute inset-0 z-[6] flex flex-col" onClick={(event) => event.stopPropagation()}>
    <div className="knowledge-retrieval-panel__header flex items-start gap-4 border-b px-5 py-4">
      <span className="knowledge-retrieval-panel__icon flex size-10 shrink-0 items-center justify-center rounded-[12px]"><Search size={18} /></span>
      <div className="min-w-0 flex-1"><h3 className="theme-heading text-[16px] font-extrabold tracking-[-0.02em]">检索知识</h3><p className="theme-muted mt-1 text-[11px] font-semibold">跨节点、摘要、内容与一跳关系，找到可直接引用的知识。</p></div>
      <button aria-label="关闭知识检索" className="knowledge-icon-button" onClick={onClose} title="关闭" type="button"><X size={16} /></button>
    </div>

    <form className="knowledge-retrieval-panel__form border-b px-5 py-4" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <div className="knowledge-retrieval-input flex items-center gap-3 rounded-[13px] border px-3">
        <Search className="theme-primary shrink-0" size={18} />
        <input autoFocus className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[var(--app-muted)]" onChange={(event) => onQueryChange(event.target.value)} placeholder="例如：适合幼猫的饮食建议" value={query} />
        <button className="knowledge-action-button is-primary !h-9 shrink-0" disabled={loading || !query.trim()} type="submit">{loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}{loading ? "检索中" : "搜索"}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <fieldset className="knowledge-retrieval-options"><legend>范围</legend><label><input checked={scope === "all"} name="retrieval-scope" onChange={() => onScopeChange("all")} type="radio" /><span>全部空间</span></label><label><input checked={scope === "current"} name="retrieval-scope" onChange={() => onScopeChange("current")} type="radio" /><span>当前：{selectedSpace.name}</span></label></fieldset>
        <fieldset className="knowledge-retrieval-options"><legend>方式</legend>{([ ["hybrid", "混合"], ["semantic", "语义"], ["lexical", "关键词"], ["graph", "关联"] ] as const).map(([value, label]) => <label key={value}><input checked={mode === value} name="retrieval-mode" onChange={() => onModeChange(value)} type="radio" /><span>{label}</span></label>)}</fieldset>
      </div>
    </form>

    <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {error && <div className="knowledge-message-error rounded-[12px] border px-4 py-3 text-[11px] font-semibold">{error}</div>}
      {!error && !result && !loading && <div className="knowledge-retrieval-empty"><Search size={25} /><p>输入问题开始检索</p><span>默认使用混合检索；选择“关联”时会纳入直接相连的知识节点。</span></div>}
      {!error && loading && <div className="knowledge-retrieval-empty"><Loader2 className="animate-spin" size={25} /><p>正在检索 {scopeLabel}</p><span>正在组合关键词、语义和关系证据。</span></div>}
      {!error && result && <>
        <div className="mb-3 flex items-center justify-between gap-3"><p className="theme-heading text-[12px] font-extrabold">找到 {result.matches.length} 条相关知识</p><span className="theme-muted text-[10px] font-semibold">{modeName(result.mode)} · {Math.round(result.metadata.elapsedMs)} ms</span></div>
        {result.matches.length === 0 ? <div className="knowledge-retrieval-empty"><Search size={25} /><p>没有找到相关知识</p><span>可换用更短的关键词，或改为搜索全部知识空间。</span></div> : <ol className="knowledge-retrieval-results">{result.matches.map((match, index) => {
          const matchKey = `${match.spaceId}-${match.nodeId}`;
          const expanded = expandedMatchKey === matchKey;
          const detailId = `knowledge-retrieval-detail-${index}`;
          return <li key={matchKey} className={expanded ? "is-expanded" : ""}>
            <button aria-controls={detailId} aria-expanded={expanded} className="knowledge-retrieval-result-trigger" onClick={() => setExpandedMatchKey(expanded ? null : matchKey)} type="button">
              <span className="knowledge-retrieval-rank">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><strong className="theme-heading truncate">{match.title}</strong><em>{match.type}</em></span><span className="knowledge-retrieval-space">{match.spaceName}</span><span className="knowledge-retrieval-summary">{match.summary || match.content || "该节点暂未填写摘要。"}</span>{match.graphPath?.length ? <span className="knowledge-retrieval-path">经 {match.graphPath.map((path) => path.relation).join(" · ")} 关联到此节点</span> : null}</span>
              <ChevronDown className="knowledge-retrieval-disclosure theme-muted shrink-0" size={16} />
            </button>
            {expanded && <div className="knowledge-retrieval-detail" id={detailId}>
              <p className="knowledge-retrieval-detail__label">详细内容</p>
              <p className="knowledge-retrieval-detail__content">{match.content || match.summary || "该节点暂未填写详细内容。"}</p>
            </div>}
          </li>;
        })}</ol>}
      </>}
    </div>
    {result?.metadata.semanticUnavailableReason && <p className="knowledge-retrieval-panel__note border-t px-5 py-3">语义索引暂不可用，已自动使用关键词检索。{result.metadata.semanticUnavailableReason}</p>}
  </section>;
}

function modeName(mode: KnowledgeSearchMode) {
  return ({ hybrid: "混合检索", semantic: "语义检索", lexical: "关键词检索", graph: "关系检索" })[mode];
}

function SpaceInspector({ agents, selectedSpace, saving, onUpdateAgents }: { agents: AgentOption[]; selectedSpace: KnowledgeSpace; saving: boolean; onUpdateAgents: (ids: string[]) => void }) {
  const [ids, setIds] = useState(selectedSpace.agentIds);
  return <div><div className="flex items-center gap-2"><Bot className="theme-primary" size={18} /><h3 className="theme-heading text-[14px] font-extrabold">可使用此知识的专家</h3></div><p className="theme-muted mt-2 text-[11px] font-medium leading-5">绑定后，专家可在需要时检索这个空间中的节点和关系。</p><div className="mt-4 space-y-2">{agents.map((agent) => { const enabled = ids.includes(agent.id); return <button className={`knowledge-agent-row ${enabled ? "is-selected" : ""}`} key={agent.id} onClick={() => setIds(enabled ? ids.filter((id) => id !== agent.id) : [...ids, agent.id])} type="button"><span className="flex size-7 items-center justify-center rounded-[9px]"><Bot size={14} /></span><span className="min-w-0 flex-1 truncate text-left text-[11px] font-bold">{agent.name}</span>{enabled && <Check size={14} />}</button>; })}{agents.length === 0 && <p className="theme-muted rounded-[12px] border border-dashed px-3 py-5 text-center text-[11px]">创建专家后即可绑定知识空间。</p>}</div><button className="knowledge-action-button is-primary mt-4 w-full justify-center" disabled={saving || sameIds(ids, selectedSpace.agentIds)} onClick={() => onUpdateAgents(ids)} type="button">{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}保存专家权限</button><div className="knowledge-stat-list mt-7"><div><span>节点</span><strong>{selectedSpace.nodes.length}</strong></div><div><span>关系</span><strong>{selectedSpace.edges.length}</strong></div><div><span>已绑定专家</span><strong>{selectedSpace.agentIds.length}</strong></div></div></div>;
}

function NodeInspector({ node, saving, onDelete, onSave }: { node: KnowledgeNode; saving: boolean; onDelete: () => void; onSave: (node: Partial<KnowledgeNode>) => void }) {
  const [draft, setDraft] = useState({ title: node.title, type: node.type, summary: node.summary, content: node.content, tags: node.tags.join("，"), aliases: node.aliases.join("，") });
  return <div><div className="flex items-start gap-3"><span className="theme-primary-soft flex size-9 shrink-0 items-center justify-center rounded-[11px]"><CircleDot size={17} /></span><div className="min-w-0 flex-1"><p className="theme-muted text-[9px] font-extrabold uppercase tracking-[0.18em]">知识节点</p><h3 className="theme-heading mt-1 truncate text-[15px] font-extrabold">{node.title}</h3></div><button aria-label="删除节点" className="knowledge-icon-button is-danger" onClick={onDelete} title="删除节点" type="button"><Trash2 size={15} /></button></div><div className="mt-5 space-y-3"><KnowledgeField label="标题"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></KnowledgeField><KnowledgeField label="类型"><input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} /></KnowledgeField><KnowledgeField label="摘要"><textarea className="min-h-20" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></KnowledgeField><KnowledgeField label="详细内容"><textarea className="min-h-32" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></KnowledgeField><KnowledgeField label="标签"><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="用逗号分隔" /></KnowledgeField><KnowledgeField label="别名"><input value={draft.aliases} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} placeholder="用于扩大检索召回" /></KnowledgeField></div><button className="knowledge-action-button is-primary mt-4 w-full justify-center" disabled={saving || !draft.title.trim()} onClick={() => onSave({ ...draft, tags: splitList(draft.tags), aliases: splitList(draft.aliases) })} type="button">{saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}更新节点</button></div>;
}

function NodeCreatePanel({ draft, saving, onChange, onClose, onSave }: { draft: typeof emptyNodeDraft; saving: boolean; onChange: (draft: typeof emptyNodeDraft) => void; onClose: () => void; onSave: () => void }) {
  return <div className="knowledge-flyout absolute right-5 top-5 z-10 w-[340px] rounded-[16px] border p-4"><div className="flex items-center justify-between"><div><h3 className="theme-heading text-[14px] font-extrabold">插入知识节点</h3><p className="theme-muted mt-1 text-[10px]">保存后会自动加入当前图谱</p></div><button className="knowledge-icon-button" onClick={onClose} type="button"><X size={15} /></button></div><div className="mt-4 space-y-2"><input autoFocus className="knowledge-field h-9" onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="节点标题" value={draft.title} /><input className="knowledge-field h-9" onChange={(event) => onChange({ ...draft, type: event.target.value })} placeholder="节点类型" value={draft.type} /><textarea className="knowledge-field min-h-16 py-2" onChange={(event) => onChange({ ...draft, summary: event.target.value })} placeholder="一句话摘要" value={draft.summary} /><textarea className="knowledge-field min-h-24 py-2" onChange={(event) => onChange({ ...draft, content: event.target.value })} placeholder="详细知识内容" value={draft.content} /><input className="knowledge-field h-9" onChange={(event) => onChange({ ...draft, tags: event.target.value })} placeholder="标签，用逗号分隔" value={draft.tags} /></div><button className="knowledge-action-button is-primary mt-3 w-full justify-center" disabled={saving || !draft.title.trim()} onClick={onSave} type="button">{saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}插入图谱</button></div>;
}

function EdgeCreatePanel({ draft, nodes, saving, onChange, onClose, onSave }: { draft: { source: string; target: string; relation: string }; nodes: KnowledgeNode[]; saving: boolean; onChange: (draft: { source: string; target: string; relation: string }) => void; onClose: () => void; onSave: () => void }) {
  return <div className="knowledge-flyout absolute right-5 top-5 z-10 w-[340px] rounded-[16px] border p-4"><div className="flex items-center justify-between"><div><h3 className="theme-heading text-[14px] font-extrabold">建立知识关系</h3><p className="theme-muted mt-1 text-[10px]">用有方向的语义关系连接两个节点</p></div><button className="knowledge-icon-button" onClick={onClose} type="button"><X size={15} /></button></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><select className="knowledge-field h-10" onChange={(event) => onChange({ ...draft, source: event.target.value })} value={draft.source}><option value="">起点节点</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select><ArrowRight className="theme-muted" size={15} /><select className="knowledge-field h-10" onChange={(event) => onChange({ ...draft, target: event.target.value })} value={draft.target}><option value="">终点节点</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></div><input className="knowledge-field mt-2 h-10" onChange={(event) => onChange({ ...draft, relation: event.target.value })} placeholder="关系名称，例如：属于" value={draft.relation} /><button className="knowledge-action-button is-primary mt-3 w-full justify-center" disabled={saving || !draft.source || !draft.target || draft.source === draft.target} onClick={onSave} type="button">{saving ? <Loader2 className="animate-spin" size={14} /> : <GitBranch size={14} />}建立关系</button></div>;
}

function KnowledgeField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="theme-muted mb-1.5 block text-[10px] font-bold">{label}</span><span className="knowledge-edit-field block">{children}</span></label>; }
function splitList(value: string) { return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean); }
function sameIds(a: string[], b: string[]) { return a.length === b.length && a.every((id) => b.includes(id)); }
