import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { platformPaths } from "@backend/config/paths";

export type ObjectTable = Record<string, unknown>;

export class JsonDatabase {
  constructor(readonly directory: string) {}

  tablePath(tableName: string) {
    assertTableName(tableName);
    return path.join(this.directory, `${tableName}.json`);
  }

  async readObjectTable(tableName: string): Promise<ObjectTable> {
    const table = await readJson(this.tablePath(tableName), {});
    return isRecord(table) ? table : {};
  }

  async readListTable(tableName: string): Promise<unknown[]> {
    const table = await readJson(this.tablePath(tableName), []);
    return Array.isArray(table) ? table : [];
  }

  async writeTable(tableName: string, data: unknown) {
    await writeJson(this.tablePath(tableName), data);
  }
}

export function platformDatabase() {
  return new JsonDatabase(platformPaths().databaseDir);
}

export async function readJson(filePath: string, fallback: unknown) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const content = await readFile(filePath, "utf-8");
      if (!content.trim()) {
        if (attempt === 2) return fallback;
        await delay(12 * (attempt + 1));
        continue;
      }
      return JSON.parse(content) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      if (attempt === 2 || !(error instanceof SyntaxError)) throw error;
      await delay(12 * (attempt + 1));
    }
  }
  return fallback;
}

export async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function assertTableName(tableName: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tableName)) {
    throw new Error(`Invalid JSON database table name: ${tableName}`);
  }
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
