import { NextRequest, NextResponse } from "next/server";

const VIDEO_SERVICE = "http://127.0.0.1:8091/v1/videos";

function serviceUrl(value: string | null) {
  const candidate = value?.trim() || VIDEO_SERVICE;
  const url = new URL(candidate);
  if (!/^https?:$/.test(url.protocol) || !/\/v1\/videos\/?$/.test(url.pathname)) throw new Error("服务地址必须是以 /v1/videos 结尾的 HTTP(S) 地址。");
  return url.toString().replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const source = await request.formData().catch(() => null);
  const prompt = String(source?.get("prompt") || "").trim();
  const seconds = Number(source?.get("seconds") || 5);
  const aspectRatio = String(source?.get("aspect_ratio") || "16:9");
  let service: string;
  try { service = serviceUrl(String(source?.get("service_url") || "")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "服务地址无效。" }, { status: 400 }); }
  if (!prompt) return NextResponse.json({ error: "请提供分镜描述。" }, { status: 400 });
  if (!Number.isFinite(seconds) || seconds < 4 || seconds > 15) return NextResponse.json({ error: "视频时长需在 4 到 15 秒之间。" }, { status: 400 });
  if (!/^(16:9|9:16|1:1)$/.test(aspectRatio)) return NextResponse.json({ error: "不支持的画幅。" }, { status: 400 });
  const body = new FormData();
  body.set("prompt", prompt); body.set("seconds", String(seconds)); body.set("aspect_ratio", aspectRatio);
  const image = source?.get("image_reference");
  if (image instanceof File && image.size > 0) body.set("image_reference", image, image.name || "reference.jpg");
  try {
    const upstream = await fetch(service, { method: "POST", body, cache: "no-store", redirect: "error" });
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data ?? { error: "视频服务返回了无效响应。" }, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "无法连接视频生成服务（127.0.0.1:8091）。" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  const content = request.nextUrl.searchParams.get("content") === "1";
  let service: string;
  try { service = serviceUrl(request.nextUrl.searchParams.get("service_url")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "服务地址无效。" }, { status: 400 }); }
  if (!/^video_gen_[a-zA-Z0-9]+$/.test(id)) return NextResponse.json({ error: "视频任务标识无效。" }, { status: 400 });
  try {
    const upstreamUrl = `${service}/${encodeURIComponent(id)}${content ? "/content" : ""}`;
    const headers = content && request.headers.get("range") ? { range: request.headers.get("range")! } : undefined;
    const upstream = await fetch(upstreamUrl, { cache: "no-store", redirect: "error", headers });
    if (content) {
      if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "暂时无法读取生成的视频。" }, { status: upstream.status });
      const responseHeaders = new Headers({
        "content-type": upstream.headers.get("content-type") || "video/mp4",
        "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
        "cache-control": "no-store",
      });
      for (const header of ["content-length", "content-range"]) {
        const value = upstream.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data ?? { error: "视频服务返回了无效响应。" }, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "无法连接视频生成服务。请检查该服务是否可从 Eido 服务器访问。" }, { status: 502 });
  }
}
