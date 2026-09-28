import { spawn } from "node:child_process";
import path from "node:path";
import { platformPaths } from "../../config/paths.ts";

/** A provider boundary: retrieval code must not know how a model is hosted. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export const LOCAL_BGE_SMALL_ZH_MODEL = "BAAI/bge-small-zh-v1.5";
export const LOCAL_BGE_SMALL_ZH_DIMENSIONS = 512;

/**
 * Runs the small Chinese BGE model in the existing Python environment. It is
 * intentionally process-isolated, so the Next.js server never has to load
 * PyTorch and future providers can replace it without changing index code.
 */
export class LocalBgeSmallZhEmbeddingProvider implements EmbeddingProvider {
  readonly model = LOCAL_BGE_SMALL_ZH_MODEL;
  readonly dimensions = LOCAL_BGE_SMALL_ZH_DIMENSIONS;
  private readonly options: {
    pythonExecutable?: string;
    modelDirectory?: string;
    scriptPath?: string;
  };

  constructor(options: {
    pythonExecutable?: string;
    modelDirectory?: string;
    scriptPath?: string;
  } = {}) {
    this.options = options;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const paths = platformPaths();
    const response = await runPythonEmbedding({
      pythonExecutable: this.options.pythonExecutable ?? path.join(paths.rootDir, ".venv", "bin", "python"),
      modelDirectory: this.options.modelDirectory ?? path.join(paths.rootDir, "data", "models", "bge-small-zh-v1.5"),
      scriptPath: this.options.scriptPath ?? path.join(paths.rootDir, "src", "knowledge", "server", "python", "embed.py"),
      texts,
    });
    if (response.model !== this.model || response.dimensions !== this.dimensions) {
      throw new Error(`Embedding 模型返回不匹配：期望 ${this.model}/${this.dimensions}，实际 ${response.model}/${response.dimensions}。`);
    }
    if (response.vectors.length !== texts.length || response.vectors.some((vector) => vector.length !== this.dimensions)) {
      throw new Error("Embedding 模型返回的向量数量或维度不正确。");
    }
    return response.vectors.map((vector) => Float32Array.from(vector));
  }
}

type PythonEmbeddingResponse = { model: string; dimensions: number; vectors: number[][] };

function runPythonEmbedding(input: { pythonExecutable: string; modelDirectory: string; scriptPath: string; texts: string[] }) {
  return new Promise<PythonEmbeddingResponse>((resolve, reject) => {
    const child = spawn(input.pythonExecutable, [input.scriptPath, "--model-dir", input.modelDirectory], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`无法启动本地 Embedding 模型：${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`本地 Embedding 模型执行失败（${code}）：${stderr.trim() || "未知错误"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as PythonEmbeddingResponse);
      } catch (error) {
        reject(new Error(`Embedding 模型返回了无效数据：${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify({ texts: input.texts }));
  });
}
