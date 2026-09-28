#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "vditor", "dist");
// Vditor 运行时按 `${cdn}/dist/js/...` 拼接请求，因此本地副本需放在
// `public/vditor/dist` 下，配合 `cdn: './vditor'` 使用。
const target = path.join(root, "public", "vditor", "dist");

if (!existsSync(source)) {
  throw new Error("未找到 node_modules/vditor/dist，请先执行 npm install");
}

// 同步 Vditor 运行时按需加载的资源：
// - js/icons：工具栏 SVG 图标（动态加载，缺失会导致工具栏按钮不显示）
// - index.css / method.min.js：预览 iframe 里显式引用 `${cdn}/dist/...`
// - 其余为编辑器按需加载的 i18n、lute、highlight、katex、内容主题等
// 注意：Vditor 主入口 JS/CSS 已由 vite 打包进 bundle，无需单独同步。
const entries = [
  "index.css",
  "method.min.js",
  "css/content-theme",
  "js/i18n",
  "js/icons",
  "js/lute",
  "js/highlight.js",
  "js/katex",
  "images",
];

rmSync(path.join(root, "public", "vditor"), { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const entry of entries) {
  const from = path.join(source, entry);
  if (!existsSync(from)) continue;
  cpSync(from, path.join(target, entry), { recursive: true });
}
console.log(`已同步 Vditor 本地资源 -> public/vditor（${entries.join("、")}）`);
