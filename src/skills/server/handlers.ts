import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { platformPaths } from "@backend/config/paths";
import {
  readObjectTable,
  tablePath,
  writeJson,
  type ObjectTable,
} from "@backend/shared/database";

type SkillPayload = {
  id?: string;
  ids?: string[];
  name?: string;
  description?: string;
  content?: string;
  agentId?: string;
  enabledSkillIds?: string[];
};

const MAX_SKILL_FILES = 200;
const MAX_SKILL_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_TOTAL_BYTES = 30 * 1024 * 1024;

export async function listSkills(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ skills: [], agents: [] });
  }

  const databaseDir = platformPaths().databaseDir;
  const [skills, agents, builtinSkills] = await Promise.all([
    readObjectTable(databaseDir, "skills"),
    readObjectTable(databaseDir, "agents"),
    readBuiltinSkills(),
  ]);
  const customSkills = Object.values(skills)
    .flatMap((skill) => {
      if (!isRecord(skill) || skill.owner_user_id !== userId) {
        return [];
      }
      return [{
        id: stringValue(skill.id),
        name: stringValue(skill.name),
        description: stringValue(skill.description),
        content: stringValue(skill.content),
        source: "custom",
        kind: "skill",
        createdAt: stringValue(skill.created_at),
        updatedAt: stringValue(skill.updated_at),
      }];
    })
    .filter((skill) => skill.id && skill.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownedAgents = Object.values(agents)
    .flatMap((agent) => {
      if (!isRecord(agent) || agent.owner_user_id !== userId) {
        return [];
      }
      return [{
        id: stringValue(agent.id),
        name: stringValue(agent.name) || "Agent",
        enabledSkillIds: normalizeIds(agent.enabled_skill_ids),
      }];
    })
    .filter((agent) => agent.id);

  return NextResponse.json({
    skills: [...builtinSkills, ...customSkills],
    builtinSkillIds: builtinSkills.map((skill) => skill.id),
    defaultDisabledSkillIds: builtinSkills.map((skill) => skill.id),
    agents: ownedAgents,
  });
}

export async function createSkill(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再新增 Skill。" }, { status: 401 });
  }

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    return importSkillDirectory(request, userId);
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const validation = validateSkillPayload(payload);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const [skills, builtinSkills] = await Promise.all([
    readObjectTable(databaseDir, "skills"),
    readBuiltinSkills(),
  ]);
  const name = validation.name;
  const duplicate = Object.values(skills).some((skill) => {
    return isRecord(skill) && skill.owner_user_id === userId && stringValue(skill.name) === name;
  });

  if (duplicate || builtinSkills.some((skill) => skill.name === name)) {
    return NextResponse.json({ error: "Skill name 已存在，请换一个名称。" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const id = uniqueId(`skill_${name}`);
  const skill = {
    id,
    owner_user_id: userId,
    name,
    description: validation.description,
    content: validation.content,
    package_dir: "",
    created_at: now,
    updated_at: now,
  };

  skills[id] = skill;
  await writeJson(tablePath(databaseDir, "skills"), skills);
  return NextResponse.json({ skill });
}

export async function updateSkill(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再配置 Skill。" }, { status: 401 });
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;

  if (payload.agentId) {
    const agents = await readObjectTable(databaseDir, "agents");
    const agent = agents[payload.agentId];

    if (!isRecord(agent) || agent.owner_user_id !== userId) {
      return NextResponse.json({ error: "Agent 不存在或无权配置。" }, { status: 404 });
    }

    const [skills, builtinSkills] = await Promise.all([
      readObjectTable(databaseDir, "skills"),
      readBuiltinSkills(),
    ]);
    const availableIds = new Set([
      ...builtinSkills.map((skill) => skill.id),
      ...Object.values(skills)
        .flatMap((skill) => {
          if (!isRecord(skill) || skill.owner_user_id !== userId) {
            return [];
          }
          return [stringValue(skill.id)];
        })
        .filter(Boolean),
    ]);
    const enabledSkillIds = normalizeIds(payload.enabledSkillIds)
      .filter((id) => availableIds.has(id));

    agents[payload.agentId] = {
      ...agent,
      enabled_skill_ids: enabledSkillIds,
      updated_at: new Date().toISOString(),
    };
    await writeJson(tablePath(databaseDir, "agents"), agents);
    return NextResponse.json({ agent: agents[payload.agentId] });
  }

  const skillId = payload.id?.trim();
  if (!skillId) {
    return NextResponse.json({ error: "缺少 Skill 或 Agent 标识。" }, { status: 400 });
  }

  const skills = await readObjectTable(databaseDir, "skills");
  const currentSkill = skills[skillId];
  if (!isRecord(currentSkill) || currentSkill.owner_user_id !== userId) {
    return NextResponse.json({ error: "Skill 不存在或无权修改。" }, { status: 404 });
  }

  const validation = validateSkillPayload(payload, stringValue(currentSkill.name));
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const builtinSkills = await readBuiltinSkills();
  const duplicate = Object.values(skills).some((skill) => {
    return (
      isRecord(skill) &&
      skill.owner_user_id === userId &&
      stringValue(skill.id) !== skillId &&
      stringValue(skill.name) === validation.name
    );
  });
  if (duplicate || builtinSkills.some((skill) => skill.name === validation.name)) {
    return NextResponse.json({ error: "Skill name 已存在，请换一个名称。" }, { status: 409 });
  }

  skills[skillId] = {
    ...currentSkill,
    name: validation.name,
    description: validation.description,
    content: validation.content,
    updated_at: new Date().toISOString(),
  };
  await writeJson(tablePath(databaseDir, "skills"), skills);
  return NextResponse.json({ skill: skills[skillId] });
}

export async function deleteSkills(request: NextRequest) {
  const userId = request.cookies.get("eido_user_id")?.value.trim();

  if (!userId) {
    return NextResponse.json({ error: "请先登录后再删除 Skill。" }, { status: 401 });
  }

  const payload = await readPayload(request);
  const ids = normalizeIds(payload?.id ? [payload.id] : payload?.ids);
  if (!ids.length) {
    return NextResponse.json({ error: "请选择要删除的 Skill。" }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const [skills, agents] = await Promise.all([
    readObjectTable(databaseDir, "skills"),
    readObjectTable(databaseDir, "agents"),
  ]);
  const deletedIds: string[] = [];

  for (const id of ids) {
    const skill = skills[id];
    if (isRecord(skill) && skill.owner_user_id === userId) {
      const packageDir = stringValue(skill.package_dir);
      if (packageDir.startsWith("custom/") && isSafeRelativePath(packageDir)) {
        await rm(path.join(platformPaths().skillsDir, packageDir), { recursive: true, force: true });
      }
      delete skills[id];
      deletedIds.push(id);
    }
  }

  for (const [agentId, agent] of Object.entries(agents)) {
    if (!isRecord(agent) || agent.owner_user_id !== userId) {
      continue;
    }
    const enabledSkillIds = normalizeIds(agent.enabled_skill_ids).filter((id) => !deletedIds.includes(id));
    agents[agentId] = { ...agent, enabled_skill_ids: enabledSkillIds };
  }

  await Promise.all([
    writeJson(tablePath(databaseDir, "skills"), skills),
    writeJson(tablePath(databaseDir, "agents"), agents),
  ]);

  return NextResponse.json({ deletedIds });
}

async function importSkillDirectory(request: NextRequest, userId: string) {
  const form = await request.formData();
  const files = Array.from(form.entries()).flatMap(([field, value]) =>
    field.startsWith("files/") && value instanceof File ? [{ path: field.slice(6), file: value }] : [],
  );
  if (!files.length) {
    return NextResponse.json({ error: "请选择一个包含 SKILL.md 的目录。" }, { status: 400 });
  }
  if (files.length > MAX_SKILL_FILES) {
    return NextResponse.json({ error: `Skill 最多包含 ${MAX_SKILL_FILES} 个文件。` }, { status: 400 });
  }
  let totalBytes = 0;
  for (const item of files) {
    if (!isSafeRelativePath(item.path) || item.file.size > MAX_SKILL_FILE_BYTES) {
      return NextResponse.json({ error: "Skill 包含不安全路径或过大的文件。" }, { status: 400 });
    }
    totalBytes += item.file.size;
  }
  if (totalBytes > MAX_SKILL_TOTAL_BYTES) {
    return NextResponse.json({ error: "Skill 目录总大小不能超过 30 MB。" }, { status: 400 });
  }

  const normalized = normalizeImportedFiles(files);
  const skillFile = normalized.find((item) => item.path === "SKILL.md");
  if (!skillFile) {
    return NextResponse.json({ error: "导入目录必须在根目录包含 SKILL.md。" }, { status: 400 });
  }
  const skillContent = await skillFile.file.text();
  const validation = validateSkillPayload({
    name: readFrontmatterValue(skillContent, "name"),
    description: readFrontmatterValue(skillContent, "description"),
    content: stripFrontmatter(skillContent),
  });
  if (validation.error) {
    return NextResponse.json({ error: `SKILL.md 校验失败：${validation.error}` }, { status: 400 });
  }

  const databaseDir = platformPaths().databaseDir;
  const [skills, builtinSkills] = await Promise.all([
    readObjectTable(databaseDir, "skills"), readBuiltinSkills(),
  ]);
  const duplicate = Object.values(skills).some((skill) =>
    isRecord(skill) && skill.owner_user_id === userId && stringValue(skill.name) === validation.name,
  );
  if (duplicate || builtinSkills.some((skill) => skill.name === validation.name)) {
    return NextResponse.json({ error: "Skill name 已存在，请换一个名称。" }, { status: 409 });
  }

  const id = uniqueId(`skill_${validation.name}`);
  const packageDir = path.join("custom", id);
  const target = path.join(platformPaths().skillsDir, packageDir);
  try {
    for (const item of normalized) {
      const destination = path.join(target, item.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await item.file.arrayBuffer()));
    }
    const now = new Date().toISOString();
    const skill = {
      id, owner_user_id: userId, name: validation.name, description: validation.description,
      content: stripFrontmatter(skillContent), package_dir: packageDir,
      file_count: normalized.length, created_at: now, updated_at: now,
    };
    skills[id] = skill;
    await writeJson(tablePath(databaseDir, "skills"), skills);
    return NextResponse.json({ skill });
  } catch {
    await rm(target, { recursive: true, force: true });
    return NextResponse.json({ error: "保存 Skill 目录失败。" }, { status: 500 });
  }
}

function normalizeImportedFiles<T extends { path: string }>(files: T[]) {
  const rootNames = new Set(files.map((item) => item.path.split("/")[0]));
  const stripRoot = rootNames.size === 1 && !rootNames.has("SKILL.md");
  return files.map((item) => ({ ...item, path: stripRoot ? item.path.split("/").slice(1).join("/") : item.path }));
}

function isSafeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  return Boolean(normalized)
    && !normalized.startsWith("/")
    && !normalized.includes("\\0")
    && normalized.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

async function readBuiltinSkills() {
  const skillsDir = platformPaths().skillsDir;

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        const content = await readFile(skillPath, "utf-8").catch(() => "");
        if (!content) {
          return null;
        }
        return {
          id: entry.name,
          name: entry.name,
          description: readFrontmatterValue(content, "description") || entry.name,
          source: "eido-builtin",
          kind: "builtin",
          disabledByDefault: true,
        };
      }));
    return skills
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function readPayload(request: NextRequest): Promise<SkillPayload | null> {
  try {
    const payload = await request.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validateSkillPayload(payload: SkillPayload, fallbackName = "") {
  const name = (payload.name?.trim() || fallbackName).trim();
  const description = payload.description?.trim() || "";
  const content = payload.content?.trim() || "";

  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)) {
    return { error: "Skill name 只能包含字母、数字、下划线和连字符，并且不能以数字开头。" };
  }
  if (!description) {
    return { error: "请填写 Skill 描述。" };
  }
  if (!content) {
    return { error: "请填写 Skill 内容。" };
  }

  return { name, description, content };
}

function readFrontmatterValue(content: string, key: string) {
  if (!content.startsWith("---")) {
    return "";
  }
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return "";
  }
  const line = match[1]
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}:`));
  return line?.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "") || "";
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, "").trim();
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => stringValue(item)).filter(Boolean)))
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueId(baseId: string) {
  const normalized = baseId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${normalized || "skill"}_${Date.now().toString(36)}`;
}
