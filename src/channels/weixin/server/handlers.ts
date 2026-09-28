import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { platformPaths } from "../../../config/paths";
import { databaseDir, readObjectTable } from "../../../shared/database";
import {
  assertAgentOwnership, channelFile, defaultAgent, getQrCode, getQrStatus,
  loadState, record, runnerFile, runningPid, saveState, str,
  type ChannelState,
} from "../core";

type Flow = { id: string; ownerUserId: string; agentId: string; qrcode: string; qrLink: string; baseUrl: string; createdAt: number; verifyCode?: string };

function root() { return platformPaths().rootDir; }
function flowFile(userId: string) {
  const suffix = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return path.join(root(), "database", "channels", "weixin", `flow-${suffix}.json`);
}

async function currentUser(request: NextRequest): Promise<string | null> {
  const id = request.cookies.get("eido_user_id")?.value;
  if (!id) return null;
  const users = await readObjectTable(databaseDir(), "users");
  return record(users[id]).id === id ? id : null;
}

function problem(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function readFlow(userId: string): Promise<Flow | null> {
  try {
    const flow = record(JSON.parse(await readFile(flowFile(userId), "utf8")));
    if (flow.ownerUserId !== userId || typeof flow.createdAt !== "number" || Date.now() - flow.createdAt > 8 * 60_000) return null;
    if (!["id", "agentId", "qrcode", "qrLink", "baseUrl"].every((key) => typeof flow[key] === "string")) return null;
    return flow as Flow;
  } catch { return null; }
}

async function writeFlow(flow: Flow) {
  const file = flowFile(flow.ownerUserId);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(flow), { encoding: "utf8", mode: 0o600 });
}

async function startRunner(): Promise<boolean> {
  const lock = runnerFile(root());
  if (await managedRunnerPid()) return true;
  const state = await loadState(channelFile(root()));
  if (!state) throw new Error("请先绑定微信。");
  const logPath = path.join(path.dirname(lock), "runner.log");
  await mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
  const log = openSync(logPath, "a", 0o600);
  try {
    const child = spawn(process.execPath, ["--no-warnings", path.join(root(), "src", "channels", "weixin", "cli.ts"), "start"], {
      cwd: root(), env: { ...process.env, EIDO_ROOT_DIR: root() },
      detached: true, stdio: ["ignore", log, log],
    });
    child.unref();
  } finally { closeSync(log); }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await runningPid(lock)) return true;
  }
  throw new Error("微信 Channel 未能启动，请确认 Eido Agent 服务已运行。可查看 database/channels/weixin/runner.log。");
}

async function stopRunner() {
  const pid = await managedRunnerPid();
  if (!pid) return;
  const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 1500 });
  if (!command.includes("src/channels/weixin/cli.ts") || !command.includes("start")) {
    throw new Error("运行锁指向的不是 Eido 微信通道进程，已拒绝停止。");
  }
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await runningPid(runnerFile(root())))) return;
  }
  try { process.kill(pid, "SIGKILL"); } catch { /* It has already exited. */ }
  await unlink(runnerFile(root())).catch(() => undefined);
}

async function managedRunnerPid(): Promise<number | null> {
  const file = runnerFile(root());
  const registered = await runningPid(file);
  if (registered) {
    try {
      const command = execFileSync("ps", ["-p", String(registered), "-o", "command="], { encoding: "utf8", timeout: 1500 });
      if (command.includes("src/channels/weixin/cli.ts") && command.includes("start")) return registered;
      await unlink(file).catch(() => undefined);
    } catch { return registered; }
  }
  // Adopt a CLI process started before runner locks were introduced. This is
  // useful when the user first paired in Terminal and later opens this page.
  try {
    const lines = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 1500 }).split("\n");
    const match = lines.find((line) => /\bnode\b.*\bsrc\/channels\/weixin\/cli\.ts start(?:\s|$)/.test(line));
    const pid = match ? Number(match.trim().split(/\s+/, 1)[0]) : 0;
    if (!pid || pid === process.pid) return null;
    await writeFile(file, JSON.stringify({ pid, adopted: true }), { encoding: "utf8", mode: 0o600, flag: "wx" }).catch(() => undefined);
    return await runningPid(file);
  } catch { return null; }
}

function publicStatus(state: ChannelState | null, running: boolean) {
  return state ? {
    connected: true, running, enabled: state.enabled !== false,
    agentId: state.agentId, senderId: state.senderId,
  } : { connected: false, running: false, enabled: false };
}

export async function getWeixinChannel(request: NextRequest) {
  const userId = await currentUser(request);
  if (!userId) return problem("请先登录 Eido。", 401);
  const state = await loadState(channelFile(root()));
  if (state && state.ownerUserId !== userId) return problem("此微信通道已绑定其他 Eido 用户。", 403);
  let running = Boolean(await managedRunnerPid());
  if (state && state.enabled !== false && !running) {
    try { running = await startRunner(); }
    catch { /* The UI can display an inactive connection and offer a retry. */ }
  }
  return NextResponse.json(publicStatus(state, running));
}

export async function updateWeixinChannel(request: NextRequest) {
  const userId = await currentUser(request);
  if (!userId) return problem("请先登录 Eido。", 401);
  let payload: Record<string, unknown>;
  try { payload = record(await request.json()); }
  catch { return problem("请求格式不是有效 JSON。", 400); }
  const statePath = channelFile(root());
  const existing = await loadState(statePath);
  if (existing && existing.ownerUserId !== userId) return problem("此微信通道已绑定其他 Eido 用户。", 403);
  try {
    if (payload.action === "qr") {
      const agentId = str(payload.agentId) || await defaultAgent(root(), userId);
      await assertAgentOwnership(root(), userId, agentId);
      const qr = await getQrCode();
      const qrcode = str(qr.qrcode);
      const qrLink = str(qr.qrcode_img_content) || qrcode;
      if (!qrcode || !qrLink) throw new Error("微信没有返回二维码，请稍后重试。");
      const flow: Flow = { id: randomUUID(), ownerUserId: userId, agentId, qrcode, qrLink, baseUrl: "https://ilinkai.weixin.qq.com", createdAt: Date.now() };
      await writeFlow(flow);
      return NextResponse.json({ flowId: flow.id, qrImage: await QRCode.toDataURL(qrLink, { width: 256, margin: 1 }), status: "wait" });
    }
    if (payload.action === "poll") {
      const flow = await readFlow(userId);
      if (!flow || flow.id !== payload.flowId) return NextResponse.json({ status: "expired" });
      if (str(payload.verifyCode).trim()) {
        flow.verifyCode = str(payload.verifyCode).trim();
        await writeFlow(flow);
      }
      const result = await getQrStatus(flow.qrcode, flow.verifyCode, flow.baseUrl);
      const status = str(result.status);
      if (status === "scaned" && flow.verifyCode) {
        delete flow.verifyCode;
        await writeFlow(flow);
      }
      if (status === "scaned_but_redirect" && str(result.redirect_host)) {
        const next = new URL(str(result.redirect_host));
        if (next.protocol !== "https:") throw new Error("微信返回了无效的重定向地址。");
        flow.baseUrl = next.origin;
        await writeFlow(flow);
      }
      if (status === "confirmed") {
        const botToken = str(result.bot_token);
        const botId = str(result.ilink_bot_id);
        const senderId = str(result.ilink_user_id);
        const baseUrl = str(result.baseurl) || flow.baseUrl;
        if (!botToken || !botId || !senderId || !baseUrl.startsWith("https://")) throw new Error("微信扫码已完成，但返回的账号信息不完整。");
        if (existing) await stopRunner();
        await saveState(statePath, { ownerUserId: userId, agentId: flow.agentId, botId, botToken, senderId, baseUrl, cursor: "", handled: [], enabled: true });
        await unlink(flowFile(userId)).catch(() => undefined);
        await startRunner();
        return NextResponse.json({ status: "confirmed", ...publicStatus(await loadState(statePath), true) });
      }
      if (status === "binded_redirect" && existing) {
        existing.enabled = true;
        await saveState(statePath, existing);
        await unlink(flowFile(userId)).catch(() => undefined);
        await startRunner();
        return NextResponse.json({ status: "confirmed", ...publicStatus(existing, true) });
      }
      if (status === "expired" || status === "verify_code_blocked") await unlink(flowFile(userId)).catch(() => undefined);
      return NextResponse.json({ status });
    }
    if (payload.action === "start") {
      if (!existing) return problem("请先绑定微信。", 409);
      existing.enabled = true;
      await saveState(statePath, existing);
      const running = await startRunner();
      return NextResponse.json(publicStatus(existing, running));
    }
    if (payload.action === "stop") {
      if (!existing) return problem("微信尚未绑定。", 409);
      existing.enabled = false;
      await saveState(statePath, existing);
      await stopRunner();
      return NextResponse.json(publicStatus(existing, Boolean(await managedRunnerPid())));
    }
    if (payload.action === "disconnect") {
      await stopRunner();
      await unlink(statePath).catch(() => undefined);
      await unlink(flowFile(userId)).catch(() => undefined);
      return NextResponse.json(publicStatus(null, false));
    }
    return problem("未知的渠道操作。", 400);
  } catch (error) {
    return problem(error instanceof Error ? error.message : "微信渠道操作失败。", 502);
  }
}
