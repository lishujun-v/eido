"use client";

import { Check, Loader2, MessageSquare, Plus, Power, Radio, RefreshCw, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type AgentOption = { id: string; name: string; isDefault: boolean };
type Status = { connected: boolean; running: boolean; enabled: boolean; agentId?: string; senderId?: string };
type ScanStatus = "wait" | "scaned" | "need_verifycode" | "expired" | "verify_code_blocked" | "confirmed" | "scaned_but_redirect";

async function request(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch("/api/channels/weixin", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "微信渠道暂时无法连接，请稍后重试。");
  return data;
}

export function ChannelWorkspace({ active, agents, authenticated, onAuthClick }: {
  active: boolean;
  agents: AgentOption[];
  authenticated: boolean;
  onAuthClick: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [flowId, setFlowId] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("wait");
  const [verifyCode, setVerifyCode] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pollBusy = useRef(false);

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const response = await fetch("/api/channels/weixin", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "读取渠道状态失败。");
      setStatus(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取渠道状态失败。");
    } finally { setLoading(false); }
  }, [authenticated]);

  useEffect(() => { if (active && authenticated) void refresh(); }, [active, authenticated, refresh]);
  useEffect(() => {
    if (!active || !authenticated || !status?.connected || qrOpen) return;
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(timer);
  }, [active, authenticated, status?.connected, qrOpen, refresh]);

  useEffect(() => {
    if (!qrOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setQrOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen]);

  useEffect(() => {
    if (!qrOpen || !flowId || ["need_verifycode", "expired", "verify_code_blocked", "confirmed"].includes(scanStatus)) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        const data = await request("poll", { flowId });
        if (cancelled) return;
        setScanStatus(data.status || "wait");
        if (data.status === "confirmed") {
          setStatus(data);
          setQrOpen(false);
          setFlowId("");
          setError("");
          return;
        }
        if (data.status === "expired" || data.status === "verify_code_blocked") {
          setError("二维码已失效，请重新生成后再扫描。");
          return;
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "扫码状态查询失败。");
      } finally {
        pollBusy.current = false;
        if (!cancelled) timer = window.setTimeout(poll, 1400);
      }
    };
    timer = window.setTimeout(poll, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [qrOpen, flowId, scanStatus]);

  async function addWeixin() {
    setBusy(true);
    setError("");
    setVerifyCode("");
    try {
      const data = await request("qr", { agentId: agents.find((agent) => agent.isDefault)?.id });
      setFlowId(data.flowId);
      setQrImage(data.qrImage);
      setScanStatus("wait");
      setQrOpen(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法生成微信二维码。"); }
    finally { setBusy(false); }
  }

  async function submitVerifyCode() {
    if (!verifyCode.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await request("poll", { flowId, verifyCode: verifyCode.trim() });
      if (data.status === "confirmed") {
        setStatus(data);
        setQrOpen(false);
        setFlowId("");
      } else setScanStatus(data.status || "wait");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "验证码提交失败。"); }
    finally { setBusy(false); }
  }

  async function changeConnection(action: "start" | "stop" | "disconnect") {
    setBusy(true);
    setError("");
    try {
      setStatus(await request(action));
      setConfirmDisconnect(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "渠道操作失败。"); }
    finally { setBusy(false); }
  }

  const boundAgent = agents.find((agent) => agent.id === status?.agentId);

  return (
    <section className="theme-orbit channel-workspace relative flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[24px] border">
      <header className="channel-header flex flex-wrap items-center justify-between gap-5 px-8 pb-5 pt-8">
        <div className="flex items-center gap-4">
          <span className="channel-header-icon flex size-14 shrink-0 items-center justify-center rounded-[17px]"><Radio size={27} strokeWidth={1.8} /></span>
          <div>
            <h1 className="theme-heading text-[29px] font-black tracking-[-0.035em]">渠道</h1>
            <p className="theme-muted-strong mt-1 text-[13px] font-medium">让 SiinX 从电脑延伸到你常用的聊天工具。</p>
          </div>
        </div>
        {status?.connected && <span className={`channel-status-pill ${status.running ? "is-online" : ""}`}><span className="channel-status-dot" />{status.running ? "微信已连接" : "微信未运行"}</span>}
      </header>

      <div className="channel-content relative z-[1] mx-auto flex w-full max-w-[920px] flex-1 flex-col px-7 pb-10 pt-5">
        {error && <div role="alert" className="channel-alert mb-5 flex items-start justify-between gap-3 rounded-[13px] px-4 py-3 text-[12px] font-semibold"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError("")} type="button"><X size={15} /></button></div>}
        {!authenticated ? (
          <div className="channel-empty mx-auto my-auto max-w-[420px] text-center">
            <div className="channel-empty-icon mx-auto flex size-20 items-center justify-center rounded-[24px]"><Radio size={34} /></div>
            <h2 className="theme-heading mt-6 text-[23px] font-bold">登录后管理渠道</h2>
            <p className="theme-muted-strong mt-2 text-[13px] leading-6">微信连接只属于当前 Eido 账户。</p>
            <button className="channel-primary mt-6" onClick={onAuthClick} type="button">登录 Eido</button>
          </div>
        ) : loading && !status ? (
          <div className="theme-muted-strong m-auto flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} />正在读取渠道状态…</div>
        ) : (
          <>
            <div className="channel-section-heading mb-4 flex items-end justify-between gap-4">
              <div><h2 className="theme-heading text-[17px] font-bold">已接入渠道</h2><p className="theme-muted-strong mt-1 text-[12px]">通过微信私聊 SiinX，消息会进入你的专属 Agent 会话。</p></div>
              {status?.connected && <button className="channel-text-button" disabled={loading} onClick={() => void refresh()} type="button"><RefreshCw size={14} />刷新状态</button>}
            </div>
            {status?.connected ? (
              <article className="channel-connection-card rounded-[18px] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="channel-weixin-mark flex size-14 shrink-0 items-center justify-center rounded-[16px]"><MessageSquare size={28} strokeWidth={2} /></span>
                    <div className="min-w-0"><h3 className="theme-heading text-[18px] font-bold">微信</h3><p className="theme-muted-strong mt-1 text-[12px]">已绑定到 {boundAgent?.name || "SiinX"}</p></div>
                  </div>
                  <span className={`channel-status-pill ${status.running ? "is-online" : ""}`}><span className="channel-status-dot" />{status.running ? "运行中" : status.enabled ? "未运行" : "已暂停"}</span>
                </div>
                <div className="channel-connection-detail mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2">
                  <div><span className="theme-muted text-[11px]">已授权微信用户</span><p className="theme-heading mt-1 truncate text-[12px] font-semibold" title={status.senderId}>{status.senderId || "已绑定"}</p></div>
                  <div><span className="theme-muted text-[11px]">访问范围</span><p className="theme-heading mt-1 text-[12px] font-semibold">仅扫码者 · 私聊文字、图片、已转写语音</p></div>
                </div>
                <div className="channel-actions mt-6 flex flex-wrap items-center gap-2 border-t pt-5">
                  <button className="channel-primary" disabled={busy || (status.running && status.enabled)} onClick={() => void changeConnection(status.running && status.enabled ? "stop" : "start")} type="button"><Power size={15} />{status.running && status.enabled ? "运行中" : "启动渠道"}</button>
                  {status.enabled && <button className="channel-secondary" disabled={busy} onClick={() => void changeConnection("stop")} type="button">暂停</button>}
                  <button className="channel-secondary" disabled={busy} onClick={() => void addWeixin()} type="button"><RefreshCw size={14} />重新绑定</button>
                  <button className="channel-danger ml-auto" disabled={busy} onClick={() => setConfirmDisconnect(true)} type="button"><Trash2 size={14} />移除</button>
                </div>
              </article>
            ) : (
              <button className="channel-add-card group flex min-h-[255px] w-full flex-col items-center justify-center rounded-[18px] border border-dashed text-center transition" disabled={busy} onClick={() => void addWeixin()} type="button">
                <span className="channel-add-icon flex size-16 items-center justify-center rounded-full"><Plus size={26} strokeWidth={1.8} /></span>
                <strong className="theme-heading mt-5 text-[17px]">添加微信</strong>
                <span className="theme-muted-strong mt-2 max-w-[320px] text-[12px] leading-6">在这里扫码绑定，无需再打开终端。绑定后即可从手机微信给 SiinX 发消息。</span>
                <span className="channel-add-cta mt-5 inline-flex items-center gap-1.5 text-[12px] font-bold">{busy ? <Loader2 className="animate-spin" size={15} /> : <Smartphone size={15} />}扫码连接</span>
              </button>
            )}
            <div className="channel-footnote mt-7 flex items-start gap-3 rounded-[14px] px-4 py-3"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><p className="text-[11px] leading-5">只有扫码绑定的微信用户可以发送私聊指令。需要你确认的电脑操作仍会在 Eido 中等待审批。</p></div>
          </>
        )}
      </div>

      {qrOpen && <div className="channel-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setQrOpen(false); }}><div aria-label="微信扫码绑定" aria-modal="true" className="channel-dialog w-full max-w-[430px] rounded-[22px] p-6" role="dialog"><div className="flex items-start justify-between gap-4"><div><h2 className="theme-heading text-[19px] font-bold">连接微信</h2><p className="theme-muted-strong mt-1 text-[12px]">用手机微信扫描二维码并确认授权。</p></div><button aria-label="关闭扫码弹窗" className="channel-close" onClick={() => setQrOpen(false)} type="button"><X size={19} /></button></div><div className="channel-qr-wrap mx-auto mt-6 flex size-[244px] items-center justify-center rounded-[16px] p-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img alt="微信绑定二维码" className="size-full object-contain" src={qrImage} /></div><div className="channel-scan-state mt-5 flex min-h-8 items-center justify-center gap-2 text-[12px] font-semibold">{scanStatus === "scaned" ? <><Check size={16} />已扫码，请在手机上确认</> : scanStatus === "need_verifycode" ? <>需要输入手机上的验证码</> : scanStatus === "expired" || scanStatus === "verify_code_blocked" ? <>二维码已失效</> : <><Loader2 className="animate-spin" size={15} />等待扫码…</>}</div>{error && <p className="channel-modal-error mt-2 text-center text-[11px] font-semibold" role="alert">{error}</p>}{scanStatus === "need_verifycode" && <div className="mt-4 flex gap-2"><input aria-label="微信验证码" autoComplete="one-time-code" className="channel-verify-input min-w-0 flex-1 rounded-[10px] px-3 text-sm outline-none" onChange={(event) => setVerifyCode(event.target.value)} placeholder="输入手机显示的验证码" value={verifyCode} /><button className="channel-primary" disabled={busy || !verifyCode.trim()} onClick={() => void submitVerifyCode()} type="button">提交</button></div>}{(scanStatus === "expired" || scanStatus === "verify_code_blocked") && <button className="channel-secondary mt-4 w-full justify-center" onClick={() => void addWeixin()} type="button"><RefreshCw size={14} />重新生成二维码</button>}<p className="theme-muted mt-5 text-center text-[11px]">二维码仅用于本次绑定，超时后会自动失效。</p></div></div>}

      {confirmDisconnect && <div className="channel-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4"><div aria-labelledby="channel-disconnect-title" aria-modal="true" className="channel-dialog w-full max-w-[390px] rounded-[20px] p-6" role="dialog"><h2 className="theme-heading text-[18px] font-bold" id="channel-disconnect-title">移除微信渠道？</h2><p className="theme-muted-strong mt-2 text-[12px] leading-6">移除后，手机微信将无法继续向 SiinX 发送指令。之前的 Eido 会话记录不会删除。</p><div className="mt-6 flex justify-end gap-2"><button className="channel-secondary" onClick={() => setConfirmDisconnect(false)} type="button">取消</button><button className="channel-danger" disabled={busy} onClick={() => void changeConnection("disconnect")} type="button">确认移除</button></div></div></div>}
    </section>
  );
}
