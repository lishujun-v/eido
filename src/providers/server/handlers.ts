import { NextRequest, NextResponse } from "next/server";
import {
  databaseDir,
  readObjectTable,
  tablePath,
  writeJson,
  type ObjectTable,
} from "@backend/shared/database";

type ProviderConfigPayload = {
  id?: string;
  name?: string;
  provider?: string;
  model?: string;
  models?: string[];
  modelSettings?: Record<string, { context_window?: unknown }>;
  apiBase?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  protocol?: string;
  authHeader?: string;
};

export async function listProviderConfigs(request: NextRequest) {
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ user: null, providerConfigs: [] });
  }

  const configs = await readObjectTable(databaseDir(), "provider_configs");
  const ownedConfigs = Object.values(configs).filter((config) => {
    return isRecord(config) && config.owner_user_id === user.id;
  });

  return NextResponse.json({
    user,
    providerConfigs: ownedConfigs,
  });
}

export async function createProviderConfig(request: NextRequest) {
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ error: "请先登录后再配置 Provider。" }, { status: 401 });
  }

  let payload: ProviderConfigPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const config = {
    id: uniqueId(slugify(`${payload.provider}-${normalizeModels(payload)[0]}`)),
    owner_user_id: user.id,
    name: payload.name?.trim() || `${payload.provider?.trim()} Provider`,
    provider: payload.provider?.trim(),
    default_model: normalizeModels(payload)[0],
    models: normalizeModels(payload),
    model_settings: normalizeModelSettings(payload),
    api_base: payload.apiBase?.trim() || "https://api.openai.com/v1",
    api_key_env: payload.apiKey?.trim() || payload.apiKeyEnv?.trim() || "OPENAI_API_KEY",
    protocol: payload.protocol?.trim() || "openai",
    auth_header: payload.authHeader?.trim() || "authorization_bearer",
    created_at: now,
    updated_at: now,
  };

  const configs = await readObjectTable(databaseDir(), "provider_configs");
  configs[config.id] = config;
  await writeJson(tablePath(databaseDir(), "provider_configs"), configs);

  return NextResponse.json({ providerConfig: config });
}

export async function updateProviderConfig(request: NextRequest) {
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ error: "请先登录后再修改 Provider。" }, { status: 401 });
  }

  let payload: ProviderConfigPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  const id = payload.id?.trim();

  if (!id) {
    return NextResponse.json({ error: "缺少 Provider 配置 ID。" }, { status: 400 });
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const configs = await readObjectTable(databaseDir(), "provider_configs");
  const currentConfig = configs[id];

  if (!isRecord(currentConfig) || currentConfig.owner_user_id !== user.id) {
    return NextResponse.json({ error: "没有找到这个 Provider 配置。" }, { status: 404 });
  }

  const updatedConfig = {
    ...currentConfig,
    name: payload.name?.trim() || `${payload.provider?.trim()} Provider`,
    provider: payload.provider?.trim(),
    default_model: normalizeModels(payload)[0],
    models: normalizeModels(payload),
    model_settings: normalizeModelSettings(payload),
    api_base: payload.apiBase?.trim() || "https://api.openai.com/v1",
    api_key_env: payload.apiKey?.trim() || payload.apiKeyEnv?.trim() || "OPENAI_API_KEY",
    protocol: payload.protocol?.trim() || "openai",
    auth_header: payload.authHeader?.trim() || "authorization_bearer",
    updated_at: new Date().toISOString(),
  };

  configs[id] = updatedConfig;
  await Promise.all([
    writeJson(tablePath(databaseDir(), "provider_configs"), configs),
    syncBoundAgents(id, updatedConfig),
  ]);

  return NextResponse.json({ providerConfig: updatedConfig });
}

export async function deleteProviderConfig(request: NextRequest) {
  const user = resolveRequestUser(request, new Date().toISOString());

  if (!user) {
    return NextResponse.json({ error: "请先登录后再删除 Provider。" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "缺少 Provider 配置 ID。" }, { status: 400 });
  }

  const configs = await readObjectTable(databaseDir(), "provider_configs");
  const currentConfig = configs[id];

  if (!isRecord(currentConfig) || currentConfig.owner_user_id !== user.id) {
    return NextResponse.json({ error: "没有找到这个 Provider 配置。" }, { status: 404 });
  }

  delete configs[id];
  await writeJson(tablePath(databaseDir(), "provider_configs"), configs);

  return NextResponse.json({ ok: true });
}

function validatePayload(payload: ProviderConfigPayload) {
  if (!payload.provider?.trim()) {
    return "Provider 是必填项。";
  }

  if (normalizeModels(payload).length === 0) {
    return "至少需要配置一个 Model。";
  }

  return "";
}

function normalizeModels(payload: ProviderConfigPayload) {
  return Array.from(new Set([
    payload.model?.trim(),
    ...(payload.models ?? []).map((model) => model.trim()),
  ].filter(Boolean) as string[]));
}

function normalizeModelSettings(payload: ProviderConfigPayload) {
  const models = new Set(normalizeModels(payload));
  const settings = payload.modelSettings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};

  return Object.fromEntries(Object.entries(settings).flatMap(([model, value]) => {
    if (!models.has(model) || !value || typeof value !== "object" || Array.isArray(value)) return [];
    const contextWindow = Number((value as { context_window?: unknown }).context_window);
    return Number.isSafeInteger(contextWindow) && contextWindow > 0 && contextWindow <= 10_000_000
      ? [[model, { context_window: contextWindow }]]
      : [];
  }));
}

async function syncBoundAgents(providerConfigId: string, config: ObjectTable) {
  const agents = await readObjectTable(databaseDir(), "agents");
  let changed = false;

  for (const [agentId, value] of Object.entries(agents)) {
    if (!isRecord(value) || value.provider_config_id !== providerConfigId) continue;

    const currentLlm = isRecord(value.llm) ? value.llm : {};
    const currentProviders = Array.isArray(currentLlm.providers) ? currentLlm.providers : [];
    const currentProvider = isRecord(currentProviders[0]) ? currentProviders[0] : {};
    const models = Array.isArray(config.models)
      ? config.models.filter((model): model is string => typeof model === "string" && Boolean(model.trim()))
      : [];
    const currentModel = typeof currentLlm.default_model === "string" ? currentLlm.default_model : "";
    const defaultModel = models.includes(currentModel)
      ? currentModel
      : String(config.default_model || models[0] || "");

    agents[agentId] = {
      ...value,
      allowed_providers: [config.provider],
      llm: {
        ...currentLlm,
        default_provider: config.provider,
        default_model: defaultModel,
        providers: [{
          ...currentProvider,
          provider: config.provider,
          protocol: config.protocol,
          api_base: config.api_base,
          api_key_env: config.api_key_env,
          auth_header: config.auth_header,
          default_model: defaultModel,
          models,
          model_settings: isRecord(config.model_settings) ? config.model_settings : {},
        }],
      },
      updated_at: new Date().toISOString(),
    };
    changed = true;
  }

  if (changed) {
    await writeJson(tablePath(databaseDir(), "agents"), agents);
  }
}

function isRecord(value: unknown): value is ObjectTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveRequestUser(request: NextRequest, now: string) {
  const id =
    request.headers.get("x-eido-user-id")?.trim() ||
    request.cookies.get("eido_user_id")?.value.trim();

  if (!id) {
    return null;
  }

  const email =
    request.headers.get("x-eido-user-email")?.trim() ||
    decodeCookieValue(request.cookies.get("eido_user_email")?.value.trim()) ||
    null;
  const name =
    request.headers.get("x-eido-user-name")?.trim() ||
    decodeCookieValue(request.cookies.get("eido_user_name")?.value.trim()) ||
    "本地用户";

  return {
    id,
    email,
    name,
    created_at: now,
    updated_at: now,
  };
}

function decodeCookieValue(value: string | undefined) {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "provider";
}

function uniqueId(baseId: string) {
  return `${baseId}-${Date.now().toString(36)}`;
}
