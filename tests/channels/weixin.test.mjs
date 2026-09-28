import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createCipheriv } from "node:crypto";
import {
  channelFile, inboundKey, inboundText, loadState, saveState,
  sessionId, validInbound, weixinPost, acquireRunner, releaseRunner, runnerFile, runningPid,
} from "../../src/channels/weixin/core.ts";
import { downloadImage, imageDownloadUrl, inboundContent } from "../../src/channels/weixin/media.ts";

const state = {
  ownerUserId: "owner", agentId: "siinx", botId: "bot", botToken: "secret",
  senderId: "owner-weixin", baseUrl: "https://ilinkai.weixin.qq.com", cursor: "", handled: [],
};

test("channel secrets remain in a private state file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eido-weixin-"));
  try {
    const file = channelFile(dir);
    await saveState(file, state);
    assert.deepEqual(await loadState(file), state);
    assert.match(await readFile(file, "utf8"), /secret/);
    if (process.platform !== "win32") {
      const { stat } = await import("node:fs/promises");
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("channel runner lock prevents a second poller", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eido-weixin-lock-"));
  const file = runnerFile(dir);
  try {
    await acquireRunner(file);
    assert.equal(await runningPid(file), process.pid);
    await assert.rejects(acquireRunner(file), /已经在运行/);
    await releaseRunner(file);
    assert.equal(await runningPid(file), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("only the paired sender's private text messages are admitted", () => {
  const message = {
    message_type: 1, message_id: 123, to_user_id: "bot", from_user_id: "owner-weixin",
    item_list: [{ type: 1, text_item: { text: "你好" } }, { type: 2, image_item: {} }],
  };
  assert.equal(validInbound(message, state), true);
  assert.equal(inboundText(message), "你好");
  assert.equal(inboundKey(message), "123");
  assert.equal(validInbound({ ...message, from_user_id: "stranger" }, state), false);
  assert.equal(validInbound({ ...message, group_id: "group" }, state), false);
  assert.equal(validInbound({ ...message, message_type: 2 }, state), false);
  assert.equal(sessionId("bot", "owner-weixin"), sessionId("bot", "owner-weixin"));
  assert.notEqual(sessionId("bot", "owner-weixin"), sessionId("bot2", "owner-weixin"));
});

test("inbound picture and voice transcript are passed through, but silent voice is identified", () => {
  const image = { type: 2, image_item: { media: { encrypt_query_param: "opaque" } } };
  const parsed = inboundContent({ item_list: [image, { type: 3, voice_item: { text: "请分析图片" } }] });
  assert.equal(parsed.text, "请分析图片");
  assert.equal(parsed.images.length, 1);
  assert.equal(parsed.hasVoiceWithoutText, false);
  assert.equal(inboundContent({ item_list: [{ type: 3, voice_item: { media: {} } }] }).hasVoiceWithoutText, true);
  assert.equal(imageDownloadUrl({ encrypt_query_param: "a&b" }).searchParams.get("encrypted_query_param"), "a&b");
  assert.throws(() => imageDownloadUrl({ full_url: "http://127.0.0.1/private" }), /不安全/);
  assert.throws(() => imageDownloadUrl({ full_url: "https://cdn.weixin.qq.com.evil.test/private" }), /不安全/);
});

test("encrypted Weixin picture becomes a bounded Agent image data URL", async () => {
  const original = globalThis.fetch;
  const key = Buffer.alloc(16, 7);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(60, 1)]);
  const cipher = createCipheriv("aes-128-ecb", key, null);
  const encrypted = Buffer.concat([cipher.update(png), cipher.final()]);
  globalThis.fetch = async () => new Response(encrypted, { status: 200 });
  try {
    const result = await downloadImage({ image_item: { aeskey: key.toString("hex"), media: { full_url: "https://novac2c.cdn.weixin.qq.com/c2c/download" } } });
    assert.equal(result, `data:image/png;base64,${png.toString("base64")}`);
  } finally { globalThis.fetch = original; }
});

test("Weixin API calls include credentials but reject insecure endpoints", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (_url, init) => {
    seen = init;
    return new Response(JSON.stringify({ ret: 0, msgs: [] }), { status: 200 });
  };
  try {
    await weixinPost("https://ilinkai.weixin.qq.com", "/ilink/bot/getupdates", { get_updates_buf: "" }, "secret");
    assert.equal(seen.headers.Authorization, "Bearer secret");
    assert.equal(JSON.parse(seen.body).base_info.bot_agent, "Eido/0.1");
    await assert.rejects(weixinPost("http://example.com", "/ilink/bot/getupdates", {}, "secret"), /HTTPS/);
  } finally { globalThis.fetch = original; }
});
