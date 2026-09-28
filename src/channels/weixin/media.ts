import { createDecipheriv } from "node:crypto";
import { record, str, type Json } from "./core.ts";

const CDN_BASE = "https://novac2c.cdn.weixin.qq.com/c2c";
const MAX_IMAGE_BYTES = 4_500_000;

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  throw new Error("微信图片格式不受 Agent 支持。");
}

function aesKey(image: Json, media: Json): Buffer | null {
  const preferred = str(image.aeskey);
  if (preferred) {
    if (!/^[a-f\d]{32}$/i.test(preferred)) throw new Error("微信图片密钥格式无效。");
    return Buffer.from(preferred, "hex");
  }
  const encoded = str(media.aes_key);
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length === 16) return decoded;
  if (decoded.length === 32 && /^[a-f\d]{32}$/i.test(decoded.toString("ascii"))) return Buffer.from(decoded.toString("ascii"), "hex");
  throw new Error("微信图片密钥格式无效。");
}

export function imageDownloadUrl(media: Json): URL {
  const full = str(media.full_url);
  const query = str(media.encrypt_query_param);
  const url = full ? new URL(full) : new URL(`/c2c/download?encrypted_query_param=${encodeURIComponent(query)}`, CDN_BASE);
  if (!full && !query) throw new Error("微信图片缺少下载地址。");
  if (url.protocol !== "https:" || !/(^|\.)cdn\.weixin\.qq\.com$/i.test(url.hostname) || url.username || url.password) {
    throw new Error("微信图片下载地址不安全。");
  }
  return url;
}

export async function downloadImage(item: Json): Promise<string> {
  const image = record(item.image_item);
  const media = record(image.media);
  const url = imageDownloadUrl(media);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`微信图片下载失败（HTTP ${response.status}）。`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_IMAGE_BYTES + 16) throw new Error("微信图片超过 Agent 的大小限制。");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("微信图片内容为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES + 16) throw new Error("微信图片超过 Agent 的大小限制。");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  let bytes = Buffer.concat(chunks);
  const key = aesKey(image, media);
  if (key) {
    const decipher = createDecipheriv("aes-128-ecb", key, null);
    bytes = Buffer.concat([decipher.update(bytes), decipher.final()]);
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("微信图片超过 Agent 的大小限制。");
  return `data:${imageMime(bytes)};base64,${bytes.toString("base64")}`;
}

export function inboundContent(message: Json): { text: string; images: Json[]; hasVoiceWithoutText: boolean } {
  const items = Array.isArray(message.item_list) ? message.item_list.map(record) : [];
  const text = items.flatMap((item) => {
    if (item.type === 1) return [str(record(item.text_item).text)];
    if (item.type === 3) return [str(record(item.voice_item).text)];
    return [];
  }).filter(Boolean).join("\n").trim();
  return {
    text,
    images: items.filter((item) => item.type === 2 && Object.keys(record(item.image_item)).length > 0).slice(0, 4),
    hasVoiceWithoutText: items.some((item) => item.type === 3 && !str(record(item.voice_item).text).trim()),
  };
}
