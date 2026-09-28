const $ = (selector) => document.querySelector(selector);
const decoder = new TextDecoder("utf-8", { fatal: false });

const CATEGORY = {
  all: { label: "全部结构", color: "#718096" },
  input: { label: "输入 / 输出", color: "#2d8aa8" },
  linear: { label: "Linear", color: "#4f6fe8" },
  attention: { label: "Attention", color: "#7c58d8" },
  activation: { label: "激活函数", color: "#d05b79" },
  normalization: { label: "Normalization", color: "#b87928" },
  convolution: { label: "Convolution", color: "#2f8e68" },
  pooling: { label: "Pooling", color: "#3b8cbf" },
  reshape: { label: "形状变换", color: "#8b69a9" },
  other: { label: "其他算子", color: "#68758a" },
};

const ICONS = {
  input: '<svg viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5"/></svg>',
  linear: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="18" cy="17" r="2"/><path d="m8 7 8 10M8 17 16 7"/></svg>',
  attention: '<svg viewBox="0 0 24 24"><path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z"/><circle cx="12" cy="12" r="2.3"/></svg>',
  activation: '<svg viewBox="0 0 24 24"><path d="M4 17c3.5 0 4-10 8-10s4.5 10 8 10"/></svg>',
  normalization: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h16M4 17h7"/></svg>',
  convolution: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="10" height="10" rx="1"/><rect x="10" y="10" width="10" height="10" rx="1"/></svg>',
  pooling: '<svg viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 4 8 4 8-4M4 16l8 4 8-4"/></svg>',
  reshape: '<svg viewBox="0 0 24 24"><path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4"/></svg>',
  other: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M9 12h6M12 9v6"/></svg>',
};

const state = {
  model: null,
  structureModel: null,
  flowModel: null,
  view: "flow",
  selectedId: null,
  category: "all",
  query: "",
  zoom: 1,
  panX: 0,
  panY: 0,
  worldWidth: 1000,
  worldHeight: 700,
};

const fileInput = $("#model-file");
const directoryInput = $("#model-directory");
const dropZone = $("#drop-zone");
const viewport = $("#graph-viewport");
const world = $("#graph-world");

$("#flow-tab").addEventListener("click", () => switchView("flow"));
$("#structure-tab").addEventListener("click", () => switchView("structure"));
$("#trace-run").addEventListener("click", runTensorTrace);
$("#trace-input").addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runTensorTrace();
});

fileInput.addEventListener("change", () => fileInput.files?.length && loadSelection([...fileInput.files]).catch(reportLoadError));
directoryInput.addEventListener("change", () => directoryInput.files?.length && loadSelection([...directoryInput.files], { directory: true }).catch(reportLoadError));
$("#replace-file").addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", () => fileInput.click());
$(".drop-actions").addEventListener("click", (event) => event.stopPropagation());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});
["dragenter", "dragover"].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault(); dropZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault(); dropZone.classList.remove("is-dragging");
}));
dropZone.addEventListener("drop", async (event) => {
  if (!event.dataTransfer) return;
  try {
    const files = await collectDroppedFiles(event.dataTransfer);
    if (files.length) await loadSelection(files, { directory: files.length > 1 });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法读取拖放的模型目录。");
  }
});
$("#sample-button").addEventListener("click", () => openModel(demoModel(), { name: "TinyTransformer.onnx", size: 28_540_928, format: "DEMO" }));

$("#node-search").addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); applyFilter(); });
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && state.model) {
    event.preventDefault(); $("#node-search").focus();
  }
});
$("#zoom-in").addEventListener("click", () => setZoom(state.zoom + .12));
$("#zoom-out").addEventListener("click", () => setZoom(state.zoom - .12));
$("#fit-graph").addEventListener("click", fitGraph);
$("#mobile-categories").addEventListener("click", () => toggleMobilePanel("sidebar"));
$("#mobile-inspector").addEventListener("click", () => toggleMobilePanel("inspector"));

let panStart = null;
viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".graph-node")) return;
  panStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
  viewport.classList.add("is-panning"); viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", (event) => {
  if (!panStart) return;
  state.panX = panStart.panX + event.clientX - panStart.x;
  state.panY = panStart.panY + event.clientY - panStart.y;
  applyTransform();
});
viewport.addEventListener("pointerup", () => { panStart = null; viewport.classList.remove("is-panning"); });
viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const oldZoom = state.zoom;
  const nextZoom = clamp(oldZoom * (event.deltaY > 0 ? .9 : 1.1), .12, 1.8);
  state.panX = px - ((px - state.panX) / oldZoom) * nextZoom;
  state.panY = py - ((py - state.panY) / oldZoom) * nextZoom;
  state.zoom = nextZoom;
  applyTransform();
}, { passive: false });
window.addEventListener("resize", () => state.model && fitGraph());

window.addEventListener("message", (event) => {
  if (event.data?.type === "eido:theme") setTheme(event.data.theme);
  if (event.data?.type === "eido:project-context-request") publishContext();
});
setTheme("light");
if (new URLSearchParams(location.search).has("demo")) {
  openModel(demoModel(), { name: "TinyTransformer.onnx", size: 28_540_928, format: "DEMO" });
}

async function loadSelection(files, options = {}) {
  const candidates = files.filter((file) => file && !/\/(?:\.git|__MACOSX)\//.test(`/${file.webkitRelativePath || file.name}`));
  if (!candidates.length) return;
  const safetensors = candidates.filter((file) => /\.safetensors$/i.test(file.name));
  if (safetensors.length) return loadSafetensorsDirectory(candidates, options);
  const supported = candidates.filter((file) => /\.(onnx|json|keras|pt|pth|torchscript)$/i.test(file.name));
  if (!supported.length) throw new Error("目录中没有找到可分析的模型。支持 Safetensors、ONNX、Keras 和 TorchScript。");
  const preferred = supported.find((file) => /\.onnx$/i.test(file.name)) || supported.find((file) => /\.keras$/i.test(file.name)) || supported[0];
  await loadFile(preferred);
}

async function loadFile(file) {
  const extension = fileExtension(file.name);
  if (extension === "safetensors") return loadSafetensorsDirectory([file]);
  $("#loading-layer").hidden = false;
  $("#loading-detail").textContent = `读取 ${formatBytes(file.size)} · ${extension.toUpperCase() || "MODEL"}`;
  await nextFrame();
  try {
    const buffer = await file.arrayBuffer();
    let model;
    if (extension === "onnx") model = parseOnnx(buffer, file.name);
    else if (extension === "json") model = parseJsonModel(JSON.parse(decoder.decode(buffer)), file.name);
    else if (extension === "keras") model = await parseKerasArchive(buffer, file.name);
    else if (["pt", "pth", "torchscript"].includes(extension)) model = await parseTorchArchive(buffer, file.name);
    else throw new Error("暂不支持这个文件格式。请选择 Safetensors、ONNX、Keras JSON / .keras 或 TorchScript 文件。");
    if (!model.nodes.length) throw new Error("文件已读取，但没有找到可视化的计算节点。请尝试导出为 ONNX 后再分析。");
    openModel(model, { name: file.name, size: file.size, format: extension.toUpperCase() });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "模型解析失败，请检查文件是否完整。");
  } finally {
    $("#loading-layer").hidden = true;
    fileInput.value = "";
    directoryInput.value = "";
  }
}

async function loadSafetensorsDirectory(files, options = {}) {
  $("#loading-layer").hidden = false;
  const allSafetensors = files.filter((file) => /\.safetensors$/i.test(file.name));
  $("#loading-detail").textContent = `发现 ${allSafetensors.length} 个 Safetensors 权重文件，正在识别模型配置…`;
  await nextFrame();
  try {
    const indexFile = files.find((file) => file.name === "model.safetensors.index.json") || files.find((file) => /\.safetensors\.index\.json$/i.test(file.name));
    const index = indexFile ? await readJsonFile(indexFile, indexFile.name) : null;
    const selected = selectSafetensorsFiles(allSafetensors, index);
    if (!selected.length) throw new Error("检测到 Safetensors 目录，但没有找到索引引用的权重分片。请确认目录下载完整。");
    const configFile = findNearestConfig(files, selected[0]);
    const config = configFile ? await readJsonFile(configFile, "config.json") : {};
    const rootName = directoryName(files) || config._name_or_path?.split("/").filter(Boolean).pop() || selected[0].name.replace(/\.safetensors$/i, "");
    const model = await parseSafetensorsFiles(selected, config, index, rootName);
    const totalSize = selected.reduce((sum, file) => sum + file.size, 0);
    const architecture = arrayOf(config.architectures)[0] || config.model_type || "Safetensors";
    openModel(model, {
      name: options.directory || files.length > 1 ? rootName : selected[0].name,
      size: totalSize,
      format: "SAFE",
      meta: `${selected.length} 个权重${indexFile ? " · 分片索引" : ""} · ${formatBytes(totalSize)} · ${architecture}`,
    });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Safetensors 解析失败，请检查模型目录是否完整。");
  } finally {
    $("#loading-layer").hidden = true;
    fileInput.value = "";
    directoryInput.value = "";
  }
}

function selectSafetensorsFiles(files, index) {
  if (index?.weight_map && typeof index.weight_map === "object") {
    const shardNames = [...new Set(Object.values(index.weight_map))];
    const selected = shardNames.map((name) => files.find((file) => relativeFilePath(file) === name || relativeFilePath(file).endsWith(`/${name}`) || file.name === name)).filter(Boolean);
    const missing = shardNames.filter((name) => !selected.some((file) => relativeFilePath(file) === name || relativeFilePath(file).endsWith(`/${name}`) || file.name === name));
    if (missing.length) throw new Error(`模型目录缺少 ${missing.length} 个权重分片，例如 ${missing.slice(0, 2).join("、")}。`);
    return selected;
  }
  const canonical = files.find((file) => file.name === "model.safetensors");
  if (canonical) return [canonical];
  const modelShards = files.filter((file) => /^model-\d+-of-\d+\.safetensors$/i.test(file.name));
  if (modelShards.length) return modelShards.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const shardGroups = new Map();
  files.forEach((file) => {
    const match = file.name.match(/^(.+)-\d+-of-\d+\.safetensors$/i);
    if (!match) return;
    const key = `${fileDirectory(file)}/${match[1]}`;
    if (!shardGroups.has(key)) shardGroups.set(key, []);
    shardGroups.get(key).push(file);
  });
  if (shardGroups.size) return [...shardGroups.values()].sort((a, b) => b.reduce((sum, file) => sum + file.size, 0) - a.reduce((sum, file) => sum + file.size, 0))[0].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return [[...files].sort((a, b) => b.size - a.size)[0]];
}

async function parseSafetensorsFiles(files, config = {}, index = null, displayName = "Safetensors model") {
  const tensors = [];
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    $("#loading-detail").textContent = `读取权重头部 ${fileIndex + 1} / ${files.length} · ${file.name}`;
    await nextFrame();
    const header = await readSafetensorsHeader(file);
    for (const [name, info] of Object.entries(header)) {
      if (name === "__metadata__" || !info || !Array.isArray(info.shape)) continue;
      tensors.push({ name, dtype: info.dtype || "?", shape: info.shape, params: tensorElementCount(info.shape), file: file.name });
    }
  }
  if (!tensors.length) throw new Error("Safetensors 文件有效，但头部没有记录任何张量。");
  return buildSafetensorsModel(tensors, config, index, displayName, files.length);
}

async function readSafetensorsHeader(file) {
  if (file.size < 10) throw new Error(`${file.name} 不是有效的 Safetensors 文件。`);
  const prefix = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const view = new DataView(prefix.buffer);
  const low = view.getUint32(0, true); const high = view.getUint32(4, true);
  const headerLength = high * 2 ** 32 + low;
  if (!Number.isSafeInteger(headerLength) || headerLength <= 1 || headerLength > 268_435_456 || headerLength + 8 > file.size) throw new Error(`${file.name} 的 Safetensors 头部长度异常。`);
  const text = decoder.decode(await file.slice(8, 8 + headerLength).arrayBuffer()).trim();
  try { return JSON.parse(text); }
  catch { throw new Error(`${file.name} 的 Safetensors 头部不是有效 JSON。`); }
}

function buildSafetensorsModel(tensors, config, index, displayName, shardCount) {
  const modules = new Map();
  tensors.forEach((tensor) => {
    const moduleName = tensorModuleName(tensor.name);
    if (!modules.has(moduleName)) modules.set(moduleName, { name: moduleName, tensors: [], params: 0 });
    const module = modules.get(moduleName); module.tensors.push(tensor); module.params += tensor.params;
  });
  const blocks = new Map();
  const nodes = [...modules.values()].map((module, moduleIndex) => {
    const descriptor = inferSafetensorsModule(module.name, config);
    const block = blockInfo(module.name);
    if (block) {
      if (!blocks.has(block.key)) blocks.set(block.key, { ...block, hasAttention: false, hasMlp: false });
      const item = blocks.get(block.key);
      item.hasAttention ||= /attn|attention|q_proj|k_proj|v_proj|query|key|value/i.test(module.name);
      item.hasMlp ||= /mlp|ffn|feed_forward|intermediate|gate_proj|up_proj|fc1/i.test(module.name);
    }
    const mainTensor = module.tensors.find((tensor) => /\.weight$|\.qweight$/i.test(tensor.name)) || module.tensors[0];
    return {
      id: `safe-module-${moduleIndex}`, name: module.name, type: descriptor.type, category: descriptor.category,
      rank: safetensorsRank(module.name, block, descriptor.priority), params: module.params, shape: tensorDims(mainTensor.shape) || "—",
      inputs: [], outputs: [{ name: module.name, shape: tensorDims(mainTensor.shape) }],
      attributes: {
        dtype: [...new Set(module.tensors.map((tensor) => tensor.dtype))].join(", "),
        tensors: module.tensors.length,
        source: [...new Set(module.tensors.map((tensor) => tensor.file))].join(", "),
        parameter_names: module.tensors.slice(0, 6).map((tensor) => tensor.name.split(".").pop()).join(", ") + (module.tensors.length > 6 ? "…" : ""),
      },
    };
  });
  let syntheticIndex = 0;
  blocks.forEach((block) => {
    if (block.hasAttention) nodes.push({
      id: `safe-attention-${syntheticIndex++}`, name: `${block.label}.attention`, type: "MultiHeadAttention", category: "attention", rank: safetensorsRank(block.key, block, 24), params: 0, shape: hiddenShape(config), inputs: [], outputs: [{ name: "attention output", shape: hiddenShape(config) }],
      attributes: compactAttributes({ num_attention_heads: config.num_attention_heads, num_key_value_heads: config.num_key_value_heads, head_dim: config.head_dim || (config.hidden_size && config.num_attention_heads ? config.hidden_size / config.num_attention_heads : undefined), attention_bias: config.attention_bias }),
    });
    if (block.hasMlp && (config.hidden_act || config.activation_function || config.hidden_activation)) {
      const activation = config.hidden_act || config.activation_function || config.hidden_activation;
      nodes.push({ id: `safe-activation-${syntheticIndex++}`, name: `${block.label}.${activation}`, type: String(activation).toUpperCase(), category: "activation", rank: safetensorsRank(block.key, block, 45), params: 0, shape: config.intermediate_size ? `[*, ${config.intermediate_size}]` : "—", inputs: [], outputs: [{ name: "activation", shape: config.intermediate_size ? `[*, ${config.intermediate_size}]` : "" }], attributes: { inferred_from: "config.json" } });
    }
  });
  nodes.push({ id: "safe-input", name: "model input", type: "Input", category: "input", rank: 0, params: 0, shape: config.hidden_size ? `[batch, sequence, ${config.hidden_size}]` : "—", inputs: [], outputs: [{ name: "hidden states", shape: hiddenShape(config) }], attributes: {} });
  nodes.push({ id: "safe-output", name: "model output", type: "Output", category: "input", rank: 10_001, params: 0, shape: config.vocab_size ? `[batch, sequence, ${config.vocab_size}]` : "—", inputs: [], outputs: [], attributes: {} });
  nodes.sort((a, b) => (a.rank - b.rank) || safetensorsNodePriority(a) - safetensorsNodePriority(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rankGroups = new Map();
  nodes.forEach((node) => { if (!rankGroups.has(node.rank)) rankGroups.set(node.rank, []); rankGroups.get(node.rank).push(node); });
  const representatives = [...rankGroups.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group.find((node) => node.category === "attention") || group[0]);
  const edges = representatives.slice(1).map((node, i) => ({ from: representatives[i].id, to: node.id, tensor: "inferred order" }));
  nodes.forEach((node, i) => {
    const previous = [...rankGroups.keys()].filter((rank) => rank < node.rank).sort((a, b) => b - a)[0];
    if (previous !== undefined) node.inputs = [{ name: rankGroups.get(previous)[0].name, shape: "" }];
  });
  const architecture = arrayOf(config.architectures)[0] || config.model_type || displayName;
  const indexTotal = Number(index?.metadata?.total_size);
  return {
    name: architecture === displayName ? displayName : `${displayName} · ${architecture}`,
    nodes, edges, analysisMode: "inferred-weights", config,
    warning: `Safetensors 只保存权重，不包含前向计算图。当前结构由 ${formatNumber(tensors.length)} 个张量名${Object.keys(config).length ? "与 config.json " : ""}推断；连接线表示模块顺序，不代表精确张量流。已读取 ${shardCount} 个权重${Number.isFinite(indexTotal) ? `，索引记录 ${formatBytes(indexTotal)}` : ""}。`,
  };
}

function inferSafetensorsModule(name, config) {
  const value = name.toLowerCase();
  if (/norm|ln_\d|layer_norm/.test(value)) return { type: /rms|rms_norm_eps/i.test(`${value} ${Object.keys(config).join(" ")}`) ? "RMSNorm" : "LayerNorm", category: "normalization", priority: /post|ln_2|output/.test(value) ? 35 : 10 };
  if (/embed|embedding|wte|wpe/.test(value)) return { type: "Embedding", category: "other", priority: 2 };
  if (/q_proj|\.query$|query_proj/.test(value)) return { type: "Linear · Query projection", category: "linear", priority: 20 };
  if (/k_proj|\.key$|key_proj/.test(value)) return { type: "Linear · Key projection", category: "linear", priority: 21 };
  if (/v_proj|\.value$|value_proj/.test(value)) return { type: "Linear · Value projection", category: "linear", priority: 22 };
  if (/o_proj|out_proj|attention\.output\.dense/.test(value)) return { type: "Linear · Attention output", category: "linear", priority: 28 };
  if (/gate_proj|up_proj|fc1|intermediate\.dense/.test(value)) return { type: "Linear · FFN expand", category: "linear", priority: 40 };
  if (/down_proj|fc2|mlp.*proj|output\.dense/.test(value)) return { type: "Linear · FFN project", category: "linear", priority: 50 };
  if (/lm_head|classifier|score|dense|linear|proj/.test(value)) return { type: "Linear", category: "linear", priority: 60 };
  if (/conv/.test(value)) return { type: "Convolution", category: "convolution", priority: 60 };
  return { type: "Parameter module", category: "other", priority: 60 };
}

function blockInfo(name) {
  const match = name.match(/(?:^|\.)(layers?|blocks?|h)\.(\d+)(?:\.|$)/i);
  if (!match) return null;
  return { key: `${match[1].toLowerCase()}.${match[2]}`, label: `${match[1]}.${match[2]}`, index: Number(match[2]) };
}

function safetensorsRank(name, block, priority) {
  if (block) return block.index + 2;
  if (/embed|embedding|wte|wpe/i.test(name)) return 1;
  if (/lm_head|classifier|score|final|norm_f|\.norm$/i.test(name)) return 10_000;
  return priority < 10 ? 1 : 9_999;
}

function safetensorsNodePriority(node) { if (node.category === "attention") return 24; if (node.category === "activation") return 45; return inferSafetensorsModule(node.name, {}).priority; }
function tensorModuleName(name) { return name.replace(/\.(?:weight|bias|running_mean|running_var|num_batches_tracked|qweight|qzeros|g_idx|scales?|zeros?|weight_scale|input_scale|output_scale|absmax|quant_map)$/i, "") || name; }
function tensorElementCount(shape) { return shape.length ? shape.reduce((product, value) => product * Math.max(0, Number(value) || 0), 1) : 1; }
function hiddenShape(config) { return config.hidden_size ? `[batch, sequence, ${config.hidden_size}]` : "—"; }
function compactAttributes(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null)); }

async function readJsonFile(file, label) {
  try { return JSON.parse(await file.text()); }
  catch { throw new Error(`${label} 不是有效 JSON，无法可靠分析模型目录。`); }
}

async function collectDroppedFiles(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const nested = await Promise.all(entries.map((entry) => readDroppedEntry(entry)));
  return nested.flat();
}

async function readDroppedEntry(entry) {
  if (entry.isFile) return new Promise((resolve, reject) => entry.file((file) => resolve([file]), reject));
  if (!entry.isDirectory) return [];
  const reader = entry.createReader(); const children = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map((child) => readDroppedEntry(child)))).flat();
}

function findNamedFile(files, name) { return files.find((file) => file.name.toLowerCase() === name.toLowerCase()); }
function relativeFilePath(file) { return String(file.webkitRelativePath || file.name).replace(/^\.\//, ""); }
function fileDirectory(file) { const path = relativeFilePath(file); return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""; }
function findNearestConfig(files, modelFile) { const directory = fileDirectory(modelFile); return files.find((file) => file.name.toLowerCase() === "config.json" && fileDirectory(file) === directory) || findNamedFile(files, "config.json"); }
function directoryName(files) { return relativeFilePath(files[0]).includes("/") ? relativeFilePath(files[0]).split("/")[0] : ""; }
function fileExtension(name) { return name.split(".").pop()?.toLowerCase() || ""; }
function reportLoadError(error) { showToast(error instanceof Error ? error.message : "模型读取失败。"); fileInput.value = ""; directoryInput.value = ""; }

function openModel(model, file) {
  state.structureModel = normalizeModel(model);
  state.flowModel = normalizeModel(buildTensorFlowModel(model, $("#trace-input").value));
  state.view = "flow";
  state.model = state.flowModel;
  state.selectedId = null; state.category = "all"; state.query = "";
  $("#node-search").value = "";
  $("#empty-view").hidden = true;
  $("#workspace").hidden = false;
  $("#file-name").textContent = file.name;
  $("#file-meta").textContent = file.meta || `${formatBytes(file.size)} · ${file.format}`;
  $("#file-glyph").textContent = file.format.slice(0, 5);
  $("#model-name").textContent = state.model.name || file.name.replace(/\.[^.]+$/, "");
  renderActiveView();
  selectNode(null); publishContext();
}

function normalizeModel(model) {
  const ids = new Set();
  model.nodes = model.nodes.map((node, index) => {
    let id = String(node.id || `node-${index}`);
    while (ids.has(id)) id += `-${index}`;
    ids.add(id);
    return {
      id, name: node.name || node.type || `Node ${index + 1}`,
      type: node.type || "Unknown",
      category: node.category || classify(node.type),
      inputs: node.inputs || [], outputs: node.outputs || [],
      shape: node.shape || "—", params: Number(node.params || 0),
      attributes: node.attributes || {},
      description: node.description || "",
      substeps: node.substeps || [],
      rank: Number.isFinite(node.rank) ? node.rank : undefined,
    };
  });
  model.edges = (model.edges || []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  return model;
}

function switchView(view) {
  if (!state.structureModel) return;
  state.view = view;
  state.model = view === "flow" ? state.flowModel : state.structureModel;
  state.selectedId = null; state.category = "all"; state.query = "";
  $("#node-search").value = "";
  renderActiveView(); selectNode(null); publishContext();
}

function renderActiveView() {
  const flow = state.view === "flow";
  $("#flow-tab").classList.toggle("is-active", flow);
  $("#structure-tab").classList.toggle("is-active", !flow);
  $("#flow-tab").setAttribute("aria-selected", String(flow));
  $("#structure-tab").setAttribute("aria-selected", String(!flow));
  $("#trace-composer").hidden = !flow;
  $("#flow-viewport").hidden = !flow;
  viewport.hidden = flow;
  $(".graph-controls").hidden = flow;
  $("#model-warning").hidden = flow || !state.structureModel.warning;
  $("#model-warning").textContent = state.structureModel.warning || "";
  const params = state.structureModel.nodes.reduce((sum, node) => sum + (node.params || 0), 0);
  $("#graph-summary").textContent = flow
    ? `${state.flowModel.nodes.length} 个关键阶段 · T = ${state.flowModel.tokens?.length || "?"}`
    : `${state.structureModel.nodes.length} 个模块 · ${state.structureModel.edges.length} 条推断连接 · ${formatNumber(params)} 参数`;
  renderCategories();
  if (flow) renderFlow();
  else { renderGraph(); requestAnimationFrame(fitGraph); }
}

function runTensorTrace() {
  if (!state.structureModel) return;
  const text = $("#trace-input").value.trim();
  if (!text) { showToast("请先输入一段文本，再推演 Tensor 流。"); return; }
  state.flowModel = normalizeModel(buildTensorFlowModel(state.structureModel, text));
  state.model = state.flowModel; state.selectedId = null;
  renderActiveView(); selectNode(null); publishContext();
}

function buildTensorFlowModel(source, text) {
  const config = source.config || {};
  const tokens = estimateTokens(text || "示例文本", config);
  const batch = 1; const sequence = tokens.length;
  const hidden = Number(config.hidden_size || config.n_embd || inferHiddenSize(source.nodes) || 768);
  const intermediate = Number(config.intermediate_size || config.n_inner || hidden * 4);
  const layers = Number(config.num_hidden_layers || config.n_layer || inferLayerCount(source.nodes) || 1);
  const heads = Number(config.num_attention_heads || config.n_head || 1);
  const vocab = Number(config.vocab_size || inferVocabSize(source.nodes) || 0);
  const architecture = String(arrayOf(config.architectures)[0] || source.name || "");
  const activation = String(config.hidden_act || config.activation_function || config.hidden_activation || "GELU").toUpperCase();
  const shape = (last) => `[${batch}, ${sequence}${last ? `, ${last}` : ""}]`;
  const nodes = [
    flowNode("flow-text", "输入文本", "Text", "input", `[${text.length} chars]`, `[${text.length} chars]`, "原始字符串，尚未进入模型。", { text_length: text.length, execution: "shape simulation" }),
    flowNode("flow-token", "Tokenizer", "Token IDs", "reshape", `[${text.length} chars]`, shape(), "切分文本并加入模型特殊标记。", { token_count: sequence, note: "当前为浏览器端估算；真实 token 需执行 tokenizer。" }),
    flowNode("flow-embed", "Token Embedding", "Embedding", "other", shape(), shape(hidden), "把每个离散 token 映射为一个 hidden-size 向量。", { vocab_size: vocab || "unknown", hidden_size: hidden }),
    flowNode("flow-blocks", `Transformer × ${layers}`, /bert|encoder/i.test(architecture) ? "Encoder stack" : "Decoder stack", "attention", shape(hidden), shape(hidden), "重复层保持主干形状不变，但 Attention 与 FFN 持续混合信息。", { layers, heads, head_dim: Math.floor(hidden / heads), intermediate_size: intermediate, activation }, [
      { name: "Norm", shape: shape(hidden) },
      { name: "Q / K / V", shape: `[${batch}, ${heads}, ${sequence}, ${Math.floor(hidden / heads)}]` },
      { name: "Attention", shape: `[${batch}, ${heads}, ${sequence}, ${sequence}]` },
      { name: `FFN + ${activation}`, shape: shape(intermediate) },
      { name: "Residual", shape: shape(hidden) },
    ]),
  ];
  if (/sentence|embedding|bertmodel|encoder/i.test(architecture) && !/maskedlm|causallm|classification/i.test(architecture)) {
    nodes.push(flowNode("flow-pool", "Pooling", "Sequence → Vector", "pooling", shape(hidden), `[${batch}, ${hidden}]`, "把整段序列聚合成一个向量；具体池化策略取决于模型封装。", { method: "model-dependent" }));
    nodes.push(flowNode("flow-output", "文本向量", "Output", "input", `[${batch}, ${hidden}]`, `[${batch}, ${hidden}]`, "可用于语义检索、聚类或相似度计算。", {}));
  } else if (/sequenceclassification|classifier/i.test(architecture)) {
    const labels = Number(config.num_labels || 2);
    nodes.push(flowNode("flow-head", "Classifier", "Linear head", "linear", shape(hidden), `[${batch}, ${labels}]`, "将序列表示映射为类别 logits。", { num_labels: labels }));
    nodes.push(flowNode("flow-output", "分类 logits", "Output", "input", `[${batch}, ${labels}]`, `[${batch}, ${labels}]`, "每个类别对应一个未归一化分数。", {}));
  } else if (vocab) {
    nodes.push(flowNode("flow-head", "LM Head", "Linear", "linear", shape(hidden), shape(vocab), "把每个位置的隐藏向量投影到词表。", { vocab_size: vocab }));
    nodes.push(flowNode("flow-output", "Token logits", "Output", "input", shape(vocab), shape(vocab), "每个位置对词表中所有 token 的预测分数。", {}));
  } else {
    nodes.push(flowNode("flow-output", "模型输出", "Output", "input", shape(hidden), shape(hidden), "输出类型需结合模型任务头确认。", {}));
  }
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  return { name: source.name, nodes, edges, tokens, traceMode: "shape-simulation", config, warning: source.warning };
}

function flowNode(id, name, type, category, inputShape, outputShape, description, attributes, substeps = []) {
  return { id, name, type, category, shape: outputShape, params: 0, inputs: [{ name: "input", shape: inputShape }], outputs: [{ name: "output", shape: outputShape }], description, attributes, substeps };
}

function estimateTokens(text, config) {
  const pieces = String(text).match(/[\u3400-\u9fff]|[A-Za-z0-9]+|[^\s]/g) || [];
  const specialStart = /bert|roberta|deberta|albert/i.test(`${config.model_type || ""} ${arrayOf(config.architectures).join(" ")}`) ? "[CLS]" : "<s>";
  const specialEnd = specialStart === "[CLS]" ? "[SEP]" : "</s>";
  return [specialStart, ...pieces.slice(0, 126), specialEnd];
}

function inferHiddenSize(nodes) {
  for (const node of nodes || []) {
    const match = String(node.shape).match(/(?:,|×)\s*(\d+)\s*\]?$/);
    if (match && Number(match[1]) >= 64) return Number(match[1]);
  }
  return 0;
}
function inferLayerCount(nodes) { return Math.max(0, ...((nodes || []).map((node) => blockInfo(node.name)?.index ?? -1))) + 1; }
function inferVocabSize(nodes) { return Math.max(0, ...((nodes || []).filter((node) => /embed|lm_head/i.test(node.name)).flatMap((node) => String(node.shape).match(/\d+/g)?.map(Number) || []))); }

function renderFlow() {
  const tokens = state.flowModel.tokens || [];
  $("#trace-token-count").textContent = `T = ${tokens.length}`;
  $("#trace-mode").textContent = "形状推演";
  $("#trace-badge").textContent = "基于配置推演 · 非真实激活";
  $("#token-strip").innerHTML = tokens.slice(0, 24).map((token, index) => `<span class="token-chip ${(index === 0 || index === tokens.length - 1) ? "is-special" : ""}">${escapeHtml(token)}</span>`).join("") + (tokens.length > 24 ? `<span class="token-chip">+${tokens.length - 24}</span>` : "");
  $("#flow-track").innerHTML = state.flowModel.nodes.map((node, index) => {
    const category = CATEGORY[node.category] || CATEGORY.other;
    const inputShape = node.inputs[0]?.shape || "—"; const outputShape = node.outputs[0]?.shape || node.shape;
    const stage = `<button class="flow-stage ${node.id === state.selectedId ? "is-selected" : ""}" data-id="${escapeHtml(node.id)}" style="--stage-color:${category.color}" type="button">
      <span class="flow-stage-head"><i class="flow-stage-icon">${ICONS[node.category] || ICONS.other}</i><span><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.type)}</small></span></span>
      <p>${escapeHtml(node.description || "")}</p>
      <span class="shape-change"><span>${escapeHtml(inputShape)}</span><svg viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5"/></svg><span>${escapeHtml(outputShape)}</span></span>
    </button>`;
    if (index === state.flowModel.nodes.length - 1) return stage;
    return `${stage}<span class="flow-arrow"><span>${escapeHtml(outputShape)}</span><svg viewBox="0 0 44 10"><path d="M1 5h40m-5-4 5 4-5 4"/></svg></span>`;
  }).join("");
  $("#flow-track").querySelectorAll(".flow-stage").forEach((button) => button.addEventListener("click", () => selectNode(button.dataset.id)));
  renderFlowDetail();
}

function renderFlowDetail() {
  const node = state.flowModel?.nodes.find((item) => item.id === state.selectedId);
  const panel = $("#flow-detail");
  if (!node?.substeps?.length) { panel.hidden = true; panel.innerHTML = ""; return; }
  panel.hidden = false;
  panel.innerHTML = `<div class="flow-detail-head"><strong>${escapeHtml(node.name)} 内部</strong><span>以下步骤会在每一层重复</span></div><div class="substep-track">${node.substeps.map((step) => `<div class="substep"><strong>${escapeHtml(step.name)}</strong><span>${escapeHtml(step.shape)}</span></div>`).join("")}</div>`;
}

function renderCategories() {
  $(".search-box").hidden = state.view === "flow";
  $(".legend").hidden = state.view === "flow";
  if (state.view === "flow") {
    $("#category-list").innerHTML = state.flowModel.nodes.map((node, index) => `<button class="category-button ${state.selectedId === node.id ? "is-active" : ""}" data-flow-id="${escapeHtml(node.id)}" type="button"><span class="category-dot" style="--cat-color:${(CATEGORY[node.category] || CATEGORY.other).color}"></span>${index + 1}. ${escapeHtml(node.name)}<b>${escapeHtml(node.shape)}</b></button>`).join("");
    $("#category-list").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectNode(button.dataset.flowId)));
    return;
  }
  const counts = state.model.nodes.reduce((map, node) => ((map[node.category] = (map[node.category] || 0) + 1), map), {});
  const keys = ["all", ...Object.keys(CATEGORY).filter((key) => key !== "all" && counts[key])];
  $("#category-list").innerHTML = keys.map((key) => `
    <button class="category-button ${state.category === key ? "is-active" : ""}" data-category="${key}" type="button">
      <span class="category-dot" style="--cat-color:${CATEGORY[key].color}"></span>${CATEGORY[key].label}<b>${key === "all" ? state.model.nodes.length : counts[key]}</b>
    </button>`).join("");
  $("#category-list").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    renderCategories(); applyFilter();
    if (window.innerWidth <= 680) { $(".model-sidebar").classList.remove("is-open"); $("#mobile-categories").setAttribute("aria-expanded", "false"); }
  }));
  $("#legend-items").innerHTML = keys.slice(1, 7).map((key) => `<span class="legend-item"><i style="--legend-color:${CATEGORY[key].color}"></i>${CATEGORY[key].label}</span>`).join("");
}

function renderGraph() {
  const { positions, width, height } = layoutGraph(state.model.nodes, state.model.edges);
  state.worldWidth = width; state.worldHeight = height;
  world.style.width = `${width}px`; world.style.height = `${height}px`;
  $("#graph-edges").setAttribute("viewBox", `0 0 ${width} ${height}`);
  $("#graph-edges").innerHTML = state.model.edges.map((edge, index) => {
    const from = positions.get(edge.from); const to = positions.get(edge.to);
    if (!from || !to) return "";
    const x1 = from.x + 152; const y1 = from.y + 35; const x2 = to.x; const y2 = to.y + 35;
    const bend = Math.max(36, (x2 - x1) * .46);
    return `<path class="graph-edge" data-edge="${escapeHtml(edge.from)}|${escapeHtml(edge.to)}" d="M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}"/>`;
  }).join("");
  $("#graph-nodes").innerHTML = state.model.nodes.map((node) => {
    const position = positions.get(node.id); const category = CATEGORY[node.category] || CATEGORY.other;
    return `<button class="graph-node" data-id="${escapeHtml(node.id)}" style="left:${position.x}px;top:${position.y}px;--node-color:${category.color}" type="button">
      <span class="node-port is-input"></span><span class="node-icon">${ICONS[node.category] || ICONS.other}</span>
      <span class="node-copy"><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(node.type)}${node.shape !== "—" ? ` · ${escapeHtml(node.shape)}` : ""}</span></span>
      <span class="node-port is-output"></span>
    </button>`;
  }).join("");
  $("#graph-nodes").querySelectorAll(".graph-node").forEach((button) => button.addEventListener("click", () => selectNode(button.dataset.id)));
  applyFilter();
}

function layoutGraph(nodes, edges) {
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => { incoming.get(edge.to)?.push(edge.from); outgoing.get(edge.from)?.push(edge.to); });
  const hasExplicitRanks = nodes.some((node) => Number.isFinite(node.rank));
  const rank = new Map(nodes.map((node) => [node.id, Number.isFinite(node.rank) ? node.rank : 0]));
  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length || 0]));
  if (!hasExplicitRanks) {
    const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
    let cursor = 0;
    while (cursor < queue.length) {
      const id = queue[cursor++];
      for (const child of outgoing.get(id) || []) {
        rank.set(child, Math.min(80, Math.max(rank.get(child) || 0, (rank.get(id) || 0) + 1)));
        indegree.set(child, (indegree.get(child) || 1) - 1);
        if (indegree.get(child) === 0) queue.push(child);
      }
    }
  }
  const columns = new Map();
  nodes.forEach((node) => { const r = rank.get(node.id) || 0; if (!columns.has(r)) columns.set(r, []); columns.get(r).push(node); });
  const orderedRanks = [...columns.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(...[...columns.values()].map((items) => items.length), 1);
  const width = Math.max(700, orderedRanks.length * 242 + 70);
  const height = Math.max(460, maxRows * 104 + 100);
  const positions = new Map();
  orderedRanks.forEach((r, columnIndex) => {
    const items = columns.get(r); const total = items.length * 70 + Math.max(0, items.length - 1) * 34;
    const start = Math.max(45, (height - total) / 2);
    items.forEach((node, row) => positions.set(node.id, { x: 44 + columnIndex * 242, y: start + row * 104 }));
  });
  return { positions, width, height };
}

function applyFilter() {
  if (!state.model) return;
  let activeCount = 0;
  const activeIds = new Set();
  $("#graph-nodes").querySelectorAll(".graph-node").forEach((element) => {
    const node = state.model.nodes.find((item) => item.id === element.dataset.id);
    const matchesCategory = state.category === "all" || node.category === state.category;
    const haystack = `${node.name} ${node.type} ${node.inputs.join(" ")} ${node.outputs.join(" ")}`.toLowerCase();
    const matchesQuery = !state.query || haystack.includes(state.query);
    const active = matchesCategory && matchesQuery;
    element.classList.toggle("is-muted", !active);
    element.classList.toggle("is-match", Boolean(state.query) && active);
    element.classList.toggle("is-selected", node.id === state.selectedId);
    if (active) { activeCount++; activeIds.add(node.id); }
  });
  $("#graph-edges").querySelectorAll(".graph-edge").forEach((element) => {
    const [from, to] = element.dataset.edge.split("|");
    element.classList.toggle("is-muted", !activeIds.has(from) || !activeIds.has(to));
    element.classList.toggle("is-active", from === state.selectedId || to === state.selectedId);
  });
  $("#graph-empty-search").hidden = activeCount > 0;
}

function selectNode(id) {
  state.selectedId = id;
  const node = state.model?.nodes.find((item) => item.id === id);
  $("#inspector-empty").hidden = Boolean(node);
  $("#inspector-content").hidden = !node;
  if (!node) { applyFilter(); if (state.view === "flow") renderFlowDetail(); return; }
  const category = CATEGORY[node.category] || CATEGORY.other;
  $("#detail-symbol").innerHTML = ICONS[node.category] || ICONS.other;
  $("#detail-symbol").style.setProperty("--detail-color", category.color);
  $("#inspector-content").style.setProperty("--detail-color", category.color);
  $("#detail-category").textContent = category.label;
  $("#detail-name").textContent = node.name;
  $("#detail-type").textContent = node.type;
  $("#detail-params").textContent = formatNumber(node.params);
  $("#detail-shape").textContent = node.shape || "—";
  renderTensors("#detail-inputs", node.inputs);
  renderTensors("#detail-outputs", node.outputs);
  const attributes = Object.entries(node.attributes).slice(0, 18);
  $("#attribute-section").hidden = attributes.length === 0;
  $("#detail-attributes").innerHTML = attributes.map(([key, value]) => `<div><dt title="${escapeHtml(key)}">${escapeHtml(key)}</dt><dd title="${escapeHtml(String(value))}">${escapeHtml(shortValue(value))}</dd></div>`).join("");
  if (state.view === "flow") { renderFlow(); renderCategories(); }
  else applyFilter();
  publishContext(node);
  if (window.innerWidth <= 680) {
    $(".model-sidebar").classList.remove("is-open");
    $("#inspector").classList.add("is-open");
    $("#mobile-categories").setAttribute("aria-expanded", "false");
    $("#mobile-inspector").setAttribute("aria-expanded", "true");
  }
}

function renderTensors(selector, tensors) {
  $(selector).innerHTML = tensors.length ? tensors.slice(0, 12).map((tensor) => {
    const item = typeof tensor === "string" ? { name: tensor, shape: "" } : tensor;
    return `<div class="tensor-chip"><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><code>${escapeHtml(item.shape || "tensor")}</code></div>`;
  }).join("") : '<span class="tensor-empty">没有记录到张量信息</span>';
}

function fitGraph() {
  if (!state.model) return;
  const rect = viewport.getBoundingClientRect();
  state.zoom = clamp(Math.min((rect.width - 72) / state.worldWidth, (rect.height - 72) / state.worldHeight), .12, 1.05);
  state.panX = state.worldWidth * state.zoom > rect.width - 72 ? 36 : (rect.width - state.worldWidth * state.zoom) / 2;
  state.panY = (rect.height - state.worldHeight * state.zoom) / 2;
  applyTransform();
}

function setZoom(value) {
  const rect = viewport.getBoundingClientRect(); const old = state.zoom;
  state.zoom = clamp(value, .12, 1.8);
  state.panX = rect.width / 2 - ((rect.width / 2 - state.panX) / old) * state.zoom;
  state.panY = rect.height / 2 - ((rect.height / 2 - state.panY) / old) * state.zoom;
  applyTransform();
}

function applyTransform() {
  world.style.transform = `translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;
  $("#zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
}

function parseOnnx(buffer, fileName) {
  const modelFields = protobufFields(new Uint8Array(buffer));
  const graphBytes = firstBytes(modelFields, 7);
  if (!graphBytes) throw new Error("这不是有效的 ONNX ModelProto，未找到计算图。");
  const graph = protobufFields(graphBytes);
  const graphName = firstString(graph, 2) || fileName.replace(/\.onnx$/i, "");
  const initializers = new Map();
  bytesList(graph, 5).forEach((bytes) => {
    const tensor = protobufFields(bytes); const name = firstString(tensor, 8);
    const dims = varintList(tensor, 1); if (name) initializers.set(name, { dims, params: dims.length ? dims.reduce((a, b) => a * Math.max(1, b), 1) : 0 });
  });
  const shapes = new Map();
  [...bytesList(graph, 11), ...bytesList(graph, 12), ...bytesList(graph, 13)].forEach((bytes) => {
    const info = parseValueInfo(bytes); if (info.name) shapes.set(info.name, info.shape);
  });
  const ops = bytesList(graph, 1).map((bytes, index) => {
    const fields = protobufFields(bytes); const inputs = stringList(fields, 1); const outputs = stringList(fields, 2);
    const type = firstString(fields, 4) || "Unknown"; const name = firstString(fields, 3) || `${type}_${index}`;
    const attributes = {};
    bytesList(fields, 5).forEach((value) => Object.assign(attributes, parseOnnxAttribute(value)));
    return { id: `op-${index}`, name, type, category: classify(type), inputs: inputs.map((item) => ({ name: item, shape: shapes.get(item) || tensorDims(initializers.get(item)?.dims) })), outputs: outputs.map((item) => ({ name: item, shape: shapes.get(item) || "" })), shape: shapes.get(outputs[0]) || "—", params: inputs.reduce((sum, input) => sum + (initializers.get(input)?.params || 0), 0), attributes, rawInputs: inputs, rawOutputs: outputs };
  });
  const nodes = []; const producer = new Map();
  const graphInputs = bytesList(graph, 11).map(parseValueInfo).filter((item) => item.name && !initializers.has(item.name));
  graphInputs.forEach((input, index) => { const id = `input-${index}`; nodes.push({ id, name: input.name, type: "Input", category: "input", inputs: [], outputs: [{ name: input.name, shape: input.shape }], shape: input.shape, attributes: {} }); producer.set(input.name, id); });
  const edges = [];
  ops.forEach((node) => node.rawOutputs.forEach((name) => producer.set(name, node.id)));
  ops.forEach((node) => { node.rawInputs.forEach((name) => { if (producer.has(name) && producer.get(name) !== node.id) edges.push({ from: producer.get(name), to: node.id, tensor: name }); }); nodes.push(node); });
  bytesList(graph, 12).map(parseValueInfo).forEach((output, index) => {
    const id = `output-${index}`; nodes.push({ id, name: output.name, type: "Output", category: "input", inputs: [{ name: output.name, shape: output.shape }], outputs: [], shape: output.shape, attributes: {} });
    if (producer.has(output.name)) edges.push({ from: producer.get(output.name), to: id, tensor: output.name });
  });
  nodes.forEach((node) => { delete node.rawInputs; delete node.rawOutputs; });
  return { name: graphName, nodes, edges };
}

function parseJsonModel(data, fileName) {
  if (data?.model_config && typeof data.model_config === "string") data = JSON.parse(data.model_config);
  if (data?.class_name || data?.config?.layers) return parseKerasConfig(data, fileName);
  if (Array.isArray(data?.nodes) || Array.isArray(data?.layers)) return parseGenericJson(data, fileName);
  throw new Error("JSON 中没有找到 Keras config、layers 或 nodes 结构。");
}

function parseKerasConfig(data, fileName) {
  const config = data.config || data; const layers = config.layers || [];
  if (!Array.isArray(layers)) throw new Error("Keras 配置中没有 layers 数组。");
  const layerNames = new Set(layers.map((layer, i) => layer?.config?.name || layer?.name || `layer_${i}`));
  const nodes = layers.map((layer, index) => {
    const item = layer.config || {}; const type = layer.class_name || layer.type || "Layer"; const name = item.name || layer.name || `${type}_${index}`;
    const shape = tensorDims(item.batch_input_shape || item.input_shape || item.target_shape || item.output_shape);
    const attributes = {};
    ["units", "activation", "filters", "kernel_size", "strides", "padding", "axis", "epsilon", "rate", "num_heads", "key_dim", "use_bias"].forEach((key) => { if (item[key] !== undefined) attributes[key] = Array.isArray(item[key]) ? item[key].join(" × ") : item[key]; });
    const inputs = collectStrings(layer.inbound_nodes).filter((value, i, list) => layerNames.has(value) && value !== name && list.indexOf(value) === i);
    return { id: `layer-${index}`, name, type, category: classify(type), inputs: inputs.map((value) => ({ name: value, shape: "" })), outputs: [{ name: name, shape }], shape: shape || "—", params: estimateKerasParams(type, item), attributes, inboundNames: inputs };
  });
  const idByName = new Map(nodes.map((node) => [node.name, node.id])); const edges = [];
  nodes.forEach((node, index) => {
    const parents = node.inboundNames.length ? node.inboundNames : (index > 0 && isSequentialConfig(data) ? [nodes[index - 1].name] : []);
    parents.forEach((name) => idByName.has(name) && edges.push({ from: idByName.get(name), to: node.id, tensor: name })); delete node.inboundNames;
  });
  return { name: config.name || fileName.replace(/\.(json|keras)$/i, ""), nodes, edges };
}

async function parseKerasArchive(buffer, fileName) {
  const files = await unzipFiles(buffer, (name) => /(^|\/)config\.json$/i.test(name));
  const configName = Object.keys(files).find((name) => /(^|\/)config\.json$/i.test(name));
  if (!configName) throw new Error(".keras 归档中没有找到 config.json。");
  return parseKerasConfig(JSON.parse(decoder.decode(files[configName])), fileName);
}

async function parseTorchArchive(buffer, fileName) {
  const files = await unzipFiles(buffer, (name) => /\.py$/i.test(name));
  const codeFiles = Object.entries(files).filter(([name]) => /\.py$/i.test(name));
  if (!codeFiles.length) throw new Error("这个 PyTorch 文件只包含权重，无法还原计算图。请导出为 ONNX 或 TorchScript 后重试。");
  const found = [];
  for (const [path, bytes] of codeFiles) {
    const text = decoder.decode(bytes);
    const patterns = [
      /self\.([A-Za-z0-9_]+)\s*=\s*(?:torch\.)?nn\.(\w+)\(([^\n]*)/g,
      /self\.([A-Za-z0-9_]+)\s*=\s*torch\.___torch_mangle_\d+\.([A-Za-z0-9_.]+)\(/g,
      /([A-Za-z0-9_]+)\s*:\s*__torch__\.torch\.nn\.modules\.([A-Za-z0-9_.]+)/g,
    ];
    patterns.forEach((regex) => { let match; while ((match = regex.exec(text))) found.push({ name: match[1], type: match[2].split(".").pop(), detail: (match[3] || "").replace(/\).*/, "").slice(0, 100), path }); });
  }
  const unique = found.filter((item, index, list) => list.findIndex((other) => other.name === item.name && other.type === item.type) === index).slice(0, 240);
  if (!unique.length) throw new Error("已找到 TorchScript 代码，但没有识别到模块定义。建议导出为 ONNX 获得完整计算图。");
  const nodes = unique.map((item, index) => ({ id: `module-${index}`, name: item.name, type: item.type, category: classify(item.type), inputs: index ? [{ name: unique[index - 1].name }] : [], outputs: [{ name: item.name }], shape: "—", params: 0, attributes: { source: item.path, definition: item.detail || "TorchScript module" } }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  return {
    name: fileName.replace(/\.(pt|pth|torchscript)$/i, ""), nodes, edges,
    analysisMode: "module-inventory",
    warning: "TorchScript 当前以模块清单模式展示：连接线表示声明顺序，不等同于真实张量流。若要查看分支、残差与完整计算图，请将模型导出为 ONNX。",
  };
}

function parseGenericJson(data, fileName) {
  const source = data.nodes || data.layers; const nodes = source.map((item, index) => ({
    id: String(item.id ?? `node-${index}`), name: item.name || item.label || item.class_name || `Node ${index + 1}`,
    type: item.type || item.op || item.class_name || "Unknown", category: classify(item.type || item.op || item.class_name),
    inputs: arrayOf(item.inputs || item.input), outputs: arrayOf(item.outputs || item.output), shape: String(item.shape || item.output_shape || "—"),
    params: Number(item.params || item.parameters || 0), attributes: item.attributes || item.config || {},
  }));
  const ids = new Set(nodes.map((node) => node.id));
  let edges = arrayOf(data.edges).map((edge) => ({ from: String(edge.from ?? edge.source), to: String(edge.to ?? edge.target) })).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  if (!edges.length) edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  return { name: data.name || fileName.replace(/\.json$/i, ""), nodes, edges };
}

function protobufFields(bytes) {
  const fields = new Map(); let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset); offset = key.next;
    const tag = key.value >>> 3; const wire = key.value & 7; let value;
    if (!tag) break;
    if (wire === 0) { const parsed = readVarint(bytes, offset); value = parsed.value; offset = parsed.next; }
    else if (wire === 1) { if (offset + 8 > bytes.length) break; value = bytes.slice(offset, offset + 8); offset += 8; }
    else if (wire === 2) { const length = readVarint(bytes, offset); offset = length.next; const end = offset + length.value; if (end > bytes.length) break; value = bytes.slice(offset, end); offset = end; }
    else if (wire === 5) { if (offset + 4 > bytes.length) break; value = bytes.slice(offset, offset + 4); offset += 4; }
    else break;
    if (!fields.has(tag)) fields.set(tag, []); fields.get(tag).push({ wire, value });
  }
  return fields;
}

function readVarint(bytes, start) {
  let value = 0, shift = 0, offset = start;
  while (offset < bytes.length && shift < 56) { const byte = bytes[offset++]; value += (byte & 0x7f) * 2 ** shift; if (!(byte & 0x80)) return { value, next: offset }; shift += 7; }
  return { value, next: offset };
}

function parseValueInfo(bytes) {
  const fields = protobufFields(bytes); const name = firstString(fields, 1); let shape = "";
  const typeBytes = firstBytes(fields, 2);
  if (typeBytes) {
    const type = protobufFields(typeBytes); const tensorBytes = firstBytes(type, 1);
    if (tensorBytes) {
      const tensorType = protobufFields(tensorBytes); const shapeBytes = firstBytes(tensorType, 2);
      if (shapeBytes) {
        const shapeFields = protobufFields(shapeBytes); const dims = bytesList(shapeFields, 1).map((dimBytes) => { const dim = protobufFields(dimBytes); return firstVarint(dim, 1) || firstString(dim, 2) || "?"; });
        shape = tensorDims(dims);
      }
    }
  }
  return { name, shape };
}

function parseOnnxAttribute(bytes) {
  const fields = protobufFields(bytes); const name = firstString(fields, 1); if (!name) return {};
  let value = firstVarint(fields, 5);
  const floatBytes = fields.get(4)?.find((item) => item.wire === 5)?.value;
  if (value === undefined && floatBytes) value = new DataView(floatBytes.buffer, floatBytes.byteOffset, 4).getFloat32(0, true);
  if (value === undefined) value = firstString(fields, 6);
  if (value === undefined) { const ints = varintList(fields, 10); if (ints.length) value = ints.join(", "); }
  if (value === undefined) { const strings = stringList(fields, 11); if (strings.length) value = strings.join(", "); }
  if (value === undefined) value = "…";
  return { [name]: value };
}

async function unzipFiles(buffer, predicate = () => true) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer); let eocd = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  if (eocd < 0) throw new Error("文件不是有效的 ZIP 模型归档。");
  const count = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true); const result = {};
  for (let index = 0; index < count && offset + 46 <= bytes.length; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true); const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true); const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (predicate(name)) {
      const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) result[name] = compressed;
      else if (method === 8) result[name] = await inflateRaw(compressed);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("当前浏览器无法解压这个模型，请使用最新版 Chrome 或 Edge。");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function classify(type = "") {
  const value = String(type).toLowerCase();
  if (/input|output/.test(value)) return "input";
  if (/attention|multihead|qkv|scaled.*dot/.test(value)) return "attention";
  if (/linear|dense|gemm|matmul/.test(value)) return "linear";
  if (/relu|gelu|silu|swish|sigmoid|softmax|tanh|elu|activation|mish/.test(value)) return "activation";
  if (/norm|batchnormalization|instancenormalization/.test(value)) return "normalization";
  if (/conv/.test(value)) return "convolution";
  if (/pool/.test(value)) return "pooling";
  if (/reshape|flatten|transpose|permute|squeeze|unsqueeze|concat|split|slice|gather/.test(value)) return "reshape";
  return "other";
}

function demoModel() {
  const specs = [
    ["tokens", "Input", "input", "[B, T]"], ["embedding", "Embedding", "other", "[B, T, 768]"], ["position", "Add", "other", "[B, T, 768]"],
    ["pre_norm", "LayerNorm", "normalization", "[B, T, 768]"], ["query_key_value", "Linear", "linear", "[B, T, 2304]"],
    ["self_attention", "MultiHeadAttention", "attention", "[B, 12, T, 64]"], ["attention_softmax", "Softmax", "activation", "[B, 12, T, T]"],
    ["attention_output", "Linear", "linear", "[B, T, 768]"], ["residual_add", "Add", "other", "[B, T, 768]"],
    ["post_norm", "LayerNorm", "normalization", "[B, T, 768]"], ["ffn_expand", "Linear", "linear", "[B, T, 3072]"],
    ["gelu", "GELU", "activation", "[B, T, 3072]"], ["ffn_project", "Linear", "linear", "[B, T, 768]"],
    ["block_output", "Add", "other", "[B, T, 768]"], ["lm_head", "Linear", "linear", "[B, T, 32000]"], ["logits", "Output", "input", "[B, T, 32000]"],
  ];
  const params = [0, 24_576_000, 0, 1_536, 1_771_776, 0, 0, 590_592, 0, 1_536, 2_362_368, 0, 2_360_064, 0, 24_576_000, 0];
  const nodes = specs.map(([name, type, category, shape], index) => ({ id: `demo-${index}`, name, type, category, shape, params: params[index], inputs: index ? [{ name: specs[index - 1][0], shape: specs[index - 1][3] }] : [], outputs: index < specs.length - 1 ? [{ name, shape }] : [], attributes: type === "MultiHeadAttention" ? { num_heads: 12, head_dim: 64, dropout: 0.1, causal: true } : type === "Linear" ? { bias: true, output_features: shape.match(/\d+(?=\])/g)?.pop() || "—" } : {} }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  edges.push({ from: "demo-2", to: "demo-8" }, { from: "demo-8", to: "demo-13" });
  return {
    name: "Tiny Transformer · Block 01", nodes, edges,
    config: { architectures: ["TinyForCausalLM"], hidden_size: 768, intermediate_size: 3072, num_hidden_layers: 1, num_attention_heads: 12, vocab_size: 32000, hidden_act: "gelu" },
  };
}

function publishContext(node) {
  if (!state.model) return;
  const categories = Object.entries(state.model.nodes.reduce((acc, item) => ((acc[item.category] = (acc[item.category] || 0) + 1), acc), {})).map(([key, count]) => `${CATEGORY[key]?.label || key}: ${count}`).join("；");
  const content = node ? `当前选中节点：${node.name}\n类型：${node.type}\n类别：${CATEGORY[node.category]?.label}\n输出形状：${node.shape}\n参数量：${node.params}\n属性：${JSON.stringify(node.attributes)}${state.model.warning ? `\n分析限制：${state.model.warning}` : ""}` : `模型：${state.model.name}\n节点数：${state.model.nodes.length}\n连接数：${state.model.edges.length}\n结构分布：${categories}${state.model.warning ? `\n分析限制：${state.model.warning}` : ""}`;
  window.parent.postMessage({ type: "eido:project-context", context: { kind: "model-architecture", title: node ? `${state.model.name} / ${node.name}` : state.model.name, content, metadata: { nodeCount: state.model.nodes.length, selectedNode: node?.name || null } } }, "*");
}

function setTheme(theme) { document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light"; }
function toggleMobilePanel(panel) {
  const sidebar = $(".model-sidebar"); const inspector = $("#inspector");
  const target = panel === "sidebar" ? sidebar : inspector; const other = panel === "sidebar" ? inspector : sidebar;
  other.classList.remove("is-open"); target.classList.toggle("is-open");
  $("#mobile-categories").setAttribute("aria-expanded", String(sidebar.classList.contains("is-open")));
  $("#mobile-inspector").setAttribute("aria-expanded", String(inspector.classList.contains("is-open")));
}
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.hidden = true; }, 10_000); }
function nextFrame() { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatBytes(bytes) { if (!Number.isFinite(bytes)) return "—"; if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB"]; let value = bytes / 1024, unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`; }
function formatNumber(value) { if (!value) return "0"; return new Intl.NumberFormat("zh-CN", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function tensorDims(value) { return Array.isArray(value) && value.length ? `[${value.map((item) => item ?? "?").join(", ")}]` : ""; }
function estimateKerasParams(type, config) { const input = config.input_dim || config.input_shape?.at?.(-1) || 0; if (/dense/i.test(type) && input && config.units) return input * config.units + (config.use_bias === false ? 0 : config.units); return Number(config.count_params || 0); }
function isSequentialConfig(data) { return String(data.class_name || "").toLowerCase() === "sequential" || !data.config?.input_layers; }
function collectStrings(value, result = []) { if (typeof value === "string") result.push(value); else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result)); else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, result)); return result; }
function arrayOf(value) { return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]; }
function shortValue(value) { const text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value); return text.length > 42 ? `${text.slice(0, 39)}…` : text; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function firstBytes(fields, tag) { return fields.get(tag)?.find((item) => item.wire === 2)?.value; }
function bytesList(fields, tag) { return (fields.get(tag) || []).filter((item) => item.wire === 2).map((item) => item.value); }
function firstString(fields, tag) { const bytes = firstBytes(fields, tag); return bytes ? decoder.decode(bytes) : ""; }
function stringList(fields, tag) { return bytesList(fields, tag).map((bytes) => decoder.decode(bytes)); }
function firstVarint(fields, tag) { return fields.get(tag)?.find((item) => item.wire === 0)?.value; }
function varintList(fields, tag) {
  const values = [];
  (fields.get(tag) || []).forEach((item) => {
    if (item.wire === 0) values.push(item.value);
    if (item.wire === 2) { let offset = 0; while (offset < item.value.length) { const parsed = readVarint(item.value, offset); if (parsed.next <= offset) break; values.push(parsed.value); offset = parsed.next; } }
  });
  return values;
}
