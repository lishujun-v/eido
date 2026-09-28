"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, CirclePlus, Lightbulb, Loader2, MessageCircle, Send, Sparkles, UsersRound, X } from "lucide-react";
import { RichMessage } from "@/components/rich-message";
import "./brainstorm-space.css";

type Agent = { id: string; name: string; agent_type?: string; avatar?: unknown; bio?: string };
type Message = { id: string; agentId: string | null; author: string; role: "user" | "agent" | "system"; content: string; createdAt: string };
type Session = { id: string; title: string; phase: "clarifying" | "discussing" | "concluded"; memberIds: string[]; messages: Message[]; conclusion: string; updatedAt: string };
type Action = "create" | "reply" | "members" | "start" | "clarify" | "turn" | "conclude";

function initials(name: string) { return name.trim().slice(0, 2).toUpperCase() || "AI"; }
function time(value: string) { return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }

export function BrainstormSpace({ active, mainAgent, agents, authenticated }: { active: boolean; mainAgent: Agent | null; agents: Agent[]; authenticated: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [input, setInput] = useState("");
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [memberOpen, setMemberOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [orchestrating, setOrchestrating] = useState(false);
  const orchestrationRef = useRef(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const allAgents = useMemo(() => mainAgent ? [mainAgent, ...agents.filter((item) => item.id !== mainAgent.id)] : agents, [mainAgent, agents]);
  const session = sessions.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!active || !authenticated) return;
    let cancelled = false;
    fetch("/api/brainstorm", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled || !ok || !Array.isArray(data?.sessions)) return;
        setSessions(data.sessions);
        setSelectedId((current) => current && data.sessions.some((item: Session) => item.id === current) ? current : data.sessions[0]?.id || "");
      }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [active, authenticated]);
  useEffect(() => { if (active) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [active, session?.messages.length]);

  const post = useCallback(async (action: Action, data: Record<string, unknown> = {}) => {
    if (orchestrationRef.current && (action === "conclude" || action === "members" || action === "reply")) {
      setError("请等待当前讨论轮次结束。");
      return null;
    }
    setBusy(action);
    setError("");
    try {
      const response = await fetch("/api/brainstorm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...data }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "操作失败，请重试。");
      const updated = result.session as Session;
      setSessions((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
      setSelectedId(updated.id);
      return updated;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
      return null;
    } finally { setBusy(""); }
  }, []);

  async function create() {
    const title = draft.trim();
    if (!title || !mainAgent) return;
    const created = await post("create", { title, memberIds: chosenIds });
    if (created) { setDraft(""); setInput(""); setMemberOpen(false); await post("clarify", { sessionId: created.id }); }
  }
  async function send() {
    if (!session || !input.trim()) return;
    const content = input.trim();
    const updated = await post("reply", { sessionId: session.id, content });
    if (updated) { setInput(""); await post("clarify", { sessionId: session.id }); }
  }
  async function discuss() {
    if (!session || orchestrationRef.current) return;
    orchestrationRef.current = true; setOrchestrating(true);
    try {
      const started = await post("start", { sessionId: session.id });
      if (!started) return;
      for (const id of started.memberIds.filter((id) => id !== mainAgent?.id)) {
        const result = await post("turn", { sessionId: started.id, agentId: id });
        if (!result) break;
      }
    } finally { orchestrationRef.current = false; setOrchestrating(false); }
  }
  async function addRound() {
    if (!session || orchestrationRef.current) return;
    orchestrationRef.current = true; setOrchestrating(true);
    try {
      for (const id of session.memberIds.filter((id) => id !== mainAgent?.id)) {
        const result = await post("turn", { sessionId: session.id, agentId: id });
        if (!result) break;
      }
    } finally { orchestrationRef.current = false; setOrchestrating(false); }
  }
  async function toggleMember(id: string) {
    if (id === mainAgent?.id) return;
    if (session) {
      const memberIds = session.memberIds.includes(id) ? session.memberIds.filter((item) => item !== id) : [...session.memberIds, id];
      await post("members", { sessionId: session.id, memberIds });
    } else setChosenIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  const activeMemberIds = session?.memberIds ?? [mainAgent?.id, ...chosenIds].filter((id): id is string => !!id);
  const phaseIndex = session?.phase === "concluded" ? 4 : session?.phase === "discussing" ? 3 : session ? 2 : 1;

  return <section className="brainstorm" aria-label="脑暴空间">
    <aside className="brainstorm-history">
      <div className="brainstorm-brand"><span className="brainstorm-brand-icon"><Sparkles size={20} /></span><div><h2>脑暴空间</h2><p>多智能体 · 共创更好的思考</p></div></div>
      <button className="brainstorm-new" type="button" onClick={() => { setSelectedId(""); setInput(""); setError(""); }}><CirclePlus size={18} /> 新建讨论</button>
      <p className="brainstorm-rail-label">最近的讨论</p>
      <div className="brainstorm-history-list">{sessions.map((item) => <button type="button" key={item.id} className={`brainstorm-history-item ${selectedId === item.id ? "is-selected" : ""}`} onClick={() => { setSelectedId(item.id); setError(""); }}><MessageCircle size={17} /><span><strong>{item.title}</strong><small>{item.phase === "concluded" ? "已完成" : item.phase === "discussing" ? "讨论中" : "澄清中"} · {item.memberIds.length} 位成员</small></span><ChevronRight size={15} /></button>)}</div>
      <div className="brainstorm-rail-note"><Lightbulb size={19} /><span>让不同视角碰撞，再由 SiinX 把想法收束成行动。</span></div>
    </aside>

    <div className="brainstorm-main">
      <header className="brainstorm-header"><div><h1>{session?.title || "开启一场有方向的脑暴"}</h1><p>{session ? `${session.memberIds.length} 位成员参与 · ${session.phase === "clarifying" ? "SiinX 正在澄清选题" : session.phase === "discussing" ? "共同讨论中" : "已形成结论"}` : "给出讨论选题，让 SiinX 主持一次多智能体讨论"}</p></div><span className="brainstorm-header-mark"><Sparkles size={19} /></span></header>
      <div className="brainstorm-steps" aria-label="讨论进度">{["提出选题", "SiinX 澄清", "群组讨论", "整合结论"].map((label, index) => <div key={label} className={`brainstorm-step ${phaseIndex > index ? "is-done" : ""} ${phaseIndex === index + 1 ? "is-current" : ""}`}><span>{phaseIndex > index + 1 ? <Check size={14} /> : index + 1}</span><strong>{label}</strong></div>)}</div>
      {error && <div className="brainstorm-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="关闭错误"><X size={15} /></button></div>}

      {!session ? <div className="brainstorm-empty"><div className="brainstorm-empty-icon"><Sparkles size={30} /></div><h2>从一个值得讨论的问题开始</h2><p>SiinX 会先与你确认范围，再邀请选中的智能体依次发言。每位成员都能看到同一份讨论记录。</p><label htmlFor="brainstorm-title">讨论选题</label><textarea id="brainstorm-title" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：AI Agent 如何提升复杂任务的协作效率？" maxLength={160} /><div className="brainstorm-empty-actions"><button type="button" className="brainstorm-subtle" onClick={() => setMemberOpen(true)}><UsersRound size={17} /> 选择参与成员 · {chosenIds.length + (mainAgent ? 1 : 0)}</button><button type="button" className="brainstorm-primary" disabled={!draft.trim() || !mainAgent || !!busy || !authenticated} onClick={() => void create()}>{busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />} 开始澄清</button></div>{!authenticated && <p className="brainstorm-hint">登录后即可创建讨论。</p>}</div> : <>
        <div className="brainstorm-message-list" role="log" aria-live="polite">{session.messages.map((item) => item.role === "system" ? <div className="brainstorm-system" key={item.id}><UsersRound size={15} />{item.content}</div> : <article className={`brainstorm-message ${item.role === "user" ? "is-user" : ""}`} key={item.id}><div className={`brainstorm-avatar ${item.role === "user" ? "is-user" : item.agentId === mainAgent?.id ? "is-main" : ""}`}>{initials(item.author)}</div><div className="brainstorm-message-body"><div className="brainstorm-message-meta"><strong>{item.author}</strong>{item.agentId === mainAgent?.id && <span>主持人</span>}<time>{time(item.createdAt)}</time></div><div className="brainstorm-bubble"><RichMessage text={item.content} /></div></div></article>)}{(busy || orchestrating) && <div className="brainstorm-pending"><Loader2 size={16} className="animate-spin" />{busy === "clarify" ? "SiinX 正在梳理选题…" : busy === "turn" || orchestrating ? "智能体正在加入讨论…" : busy === "conclude" ? "SiinX 正在整合结论…" : "正在处理…"}</div>}<div ref={bottomRef} /></div>
        <div className="brainstorm-composer">{session.phase === "clarifying" ? <><textarea aria-label="补充讨论范围" placeholder="补充讨论范围、目标或限制条件…" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} /><div className="brainstorm-composer-actions"><span>澄清充分后，随时开始群组讨论</span><button type="button" className="brainstorm-subtle" disabled={!!busy} onClick={() => void discuss()}><UsersRound size={16} /> 开始讨论</button><button type="button" className="brainstorm-primary" disabled={!input.trim() || !!busy} onClick={() => void send()}><Send size={16} /> 发送补充</button></div></> : session.phase === "discussing" ? <div className="brainstorm-composer-actions"><span>可以继续一轮讨论，或请 SiinX 汇总已有观点。</span><button type="button" className="brainstorm-subtle" disabled={!!busy} onClick={() => void addRound()}><MessageCircle size={16} /> 再讨论一轮</button><button type="button" className="brainstorm-primary" disabled={!!busy} onClick={() => void post("conclude", { sessionId: session.id })}><Sparkles size={16} /> 生成结论</button></div> : <div className="brainstorm-concluded"><Check size={17} /> 本次讨论已形成结论，可在消息流中查看完整过程。</div>}</div>
      </>}
    </div>

    <aside className="brainstorm-details"><section className="brainstorm-detail-section"><div className="brainstorm-detail-heading"><h2>讨论成员 <span>({activeMemberIds.length})</span></h2><button type="button" onClick={() => setMemberOpen(true)} disabled={session?.phase === "concluded"} title="管理成员"><CirclePlus size={16} /> 邀请智能体</button></div><div className="brainstorm-members">{allAgents.filter((item) => activeMemberIds.includes(item.id)).map((item, index) => <div className="brainstorm-member" key={item.id}><span className={`brainstorm-member-avatar tone-${index % 5}`}>{initials(item.name)}</span><strong>{item.name}</strong><small>{item.id === mainAgent?.id ? "主 Agent · 主持" : "讨论成员"}</small></div>)}</div></section><section className="brainstorm-detail-section"><h2>讨论进度</h2><div className="brainstorm-detail-progress"><span><Check size={15} /> 选题与参与者</span><span className={session ? "is-on" : ""}><Check size={15} /> SiinX 澄清</span><span className={session?.phase !== "clarifying" ? "is-on" : ""}><Check size={15} /> 多视角讨论</span><span className={session?.phase === "concluded" ? "is-on" : ""}><Check size={15} /> 形成结论</span></div></section><section className="brainstorm-detail-section brainstorm-conclusion-card"><div className="brainstorm-conclusion-title"><Sparkles size={19} /><h2>SiinX 整合结论</h2></div><p>{session?.conclusion ? "已综合所有实际发言，结论展示在讨论消息的末尾。" : "讨论结束后，SiinX 会汇总共识、分歧和下一步行动。"}</p>{session?.phase === "discussing" && <button type="button" className="brainstorm-primary" disabled={!!busy} onClick={() => void post("conclude", { sessionId: session.id })}>开始整合结论 <ArrowRight size={16} /></button>}</section></aside>
    {memberOpen && <div className="brainstorm-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberOpen(false); }}><section className="brainstorm-modal" role="dialog" aria-modal="true" aria-label="选择讨论成员"><div className="brainstorm-modal-head"><div><h2>选择讨论成员</h2><p>SiinX 始终参与并主持讨论</p></div><button type="button" onClick={() => setMemberOpen(false)} aria-label="关闭"><X size={20} /></button></div><div className="brainstorm-modal-list">{allAgents.map((item, index) => <button type="button" key={item.id} className="brainstorm-modal-member" disabled={item.id === mainAgent?.id || !!busy} onClick={() => void toggleMember(item.id)}><span className={`brainstorm-member-avatar tone-${index % 5}`}>{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.id === mainAgent?.id ? "SiinX 主 Agent · 必选" : item.bio || "任务智能体"}</small></span><span className={`brainstorm-check ${activeMemberIds.includes(item.id) ? "is-checked" : ""}`}>{activeMemberIds.includes(item.id) && <Check size={14} />}</span></button>)}</div><button type="button" className="brainstorm-primary brainstorm-modal-done" onClick={() => setMemberOpen(false)}>完成选择</button></section></div>}
  </section>;
}
