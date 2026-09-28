"use client";

import { Cpu, Edit3, KeyRound, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ProviderConfig = {
  id: string;
  name: string;
  provider: string;
  default_model: string;
  models?: string[];
  model_settings?: Record<string, { context_window?: number }>;
  api_base: string;
  api_key_env: string;
  protocol: string;
  auth_header: string;
};

type MainAgent = {
  id: string;
  name: string;
  provider_config_id?: string;
  llm?: {
    default_model?: string | null;
  };
};

type ProviderPreset = {
  id: string;
  label: string;
  apiBase: string;
  apiKeyPlaceholder: string;
  modelPlaceholder: string;
  protocol?: "openai" | "anthropic";
  authHeader?: "authorization_bearer" | "x-api-key";
};

type ProviderConfigDraft = {
  name: string;
  presetId: string;
  customProvider: string;
  modelInput: string;
  models: string[];
  modelSettings: Record<string, { contextWindow: string }>;
  apiKey: string;
  apiBase: string;
  protocol: "openai" | "anthropic";
  authHeader: "authorization_bearer" | "x-api-key";
};

const providerPresets: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    apiBase: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "gpt-4.1\ngpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    apiBase: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-...",
    modelPlaceholder: "claude-3-5-sonnet-latest",
    protocol: "anthropic",
    authHeader: "x-api-key",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiBase: "https://api.deepseek.com",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "deepseek-chat\ndeepseek-reasoner",
  },
  {
    id: "gemini",
    label: "Gemini",
    apiBase: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyPlaceholder: "AIza...",
    modelPlaceholder: "gemini-2.5-pro\ngemini-2.5-flash",
  },
  {
    id: "zhipu",
    label: "智谱 AI",
    apiBase: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyPlaceholder: "你的 ZAI_API_KEY",
    modelPlaceholder: "glm-4.5\nglm-4.5-air",
  },
  {
    id: "dashscope",
    label: "DashScope",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "qwen-plus\nqwen-max",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    apiBase: "https://api.moonshot.ai/v1",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "kimi-k2.5\nmoonshot-v1-8k",
  },
  {
    id: "minimax",
    label: "MiniMax",
    apiBase: "https://api.minimax.io/v1",
    apiKeyPlaceholder: "你的 MINIMAX_API_KEY",
    modelPlaceholder: "MiniMax-M1",
  },
  {
    id: "mistral",
    label: "Mistral",
    apiBase: "https://api.mistral.ai/v1",
    apiKeyPlaceholder: "你的 MISTRAL_API_KEY",
    modelPlaceholder: "mistral-large-latest\ncodestral-latest",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    apiBase: "https://api.siliconflow.cn/v1",
    apiKeyPlaceholder: "sk-...",
    modelPlaceholder: "Qwen/Qwen3-235B-A22B",
  },
  {
    id: "volcengine",
    label: "VolcEngine",
    apiBase: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyPlaceholder: "你的火山引擎 API Key",
    modelPlaceholder: "doubao-seed-1-6",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiBase: "https://openrouter.ai/api/v1",
    apiKeyPlaceholder: "sk-or-...",
    modelPlaceholder: "anthropic/claude-3.5-sonnet\nopenai/gpt-4.1",
  },
  {
    id: "groq",
    label: "Groq",
    apiBase: "https://api.groq.com/openai/v1",
    apiKeyPlaceholder: "gsk_...",
    modelPlaceholder: "llama-3.3-70b-versatile",
  },
  {
    id: "ollama",
    label: "Ollama",
    apiBase: "http://localhost:11434/v1",
    apiKeyPlaceholder: "本地可留空或填 ollama",
    modelPlaceholder: "llama3.1\nqwen2.5",
  },
  {
    id: "custom",
    label: "Custom",
    apiBase: "",
    apiKeyPlaceholder: "API key 或环境变量名",
    modelPlaceholder: "your-model-name",
  },
];

const initialDraft: ProviderConfigDraft = {
  name: "",
  presetId: "openai",
  customProvider: "",
  modelInput: "",
  models: [],
  modelSettings: {},
  apiKey: "",
  apiBase: providerPresets[0].apiBase,
  protocol: "openai",
  authHeader: "authorization_bearer",
};

export function ProviderConfigManager({
  mainAgent,
  onMainAgentUpdated,
}: {
  mainAgent?: MainAgent | null;
  onMainAgentUpdated?: (agent: MainAgent) => void;
}) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ProviderConfigDraft>(initialDraft);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingConfigId, setIsApplyingConfigId] = useState("");

  const selectedPreset = useMemo(
    () => providerPresets.find((preset) => preset.id === draft.presetId) ?? providerPresets[0],
    [draft.presetId],
  );
  const isCustom = selectedPreset.id === "custom";
  const providerName = isCustom ? draft.customProvider.trim() : selectedPreset.id;
  const apiBase = isCustom ? draft.apiBase.trim() : selectedPreset.apiBase;
  const protocol = isCustom ? draft.protocol : selectedPreset.protocol ?? "openai";
  const authHeader = isCustom ? draft.authHeader : selectedPreset.authHeader ?? "authorization_bearer";

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/provider-configs", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Provider 配置失败。");
      }

      const nextConfigs = Array.isArray(data?.providerConfigs) ? data.providerConfigs : [];
      setConfigs(nextConfigs);
      setSelectedModels((current) => Object.fromEntries(nextConfigs.map((config: ProviderConfig) => {
        const models = getConfigModels(config);
        const currentModel = current[config.id];
        const mainAgentModel = mainAgent?.provider_config_id === config.id ? mainAgent.llm?.default_model : "";
        return [config.id, models.includes(currentModel) ? currentModel : (models.includes(mainAgentModel || "") ? mainAgentModel : models[0] || "")];
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取 Provider 配置失败。");
    } finally {
      setIsLoading(false);
    }
  }

  function selectModel(config: ProviderConfig, model: string) {
    setSelectedModels((current) => ({ ...current, [config.id]: model }));
    setError("");

    if (mainAgent?.provider_config_id === config.id) {
      applyConfigToMainAgent(config, model, false);
    }
  }

  async function applyConfigToMainAgent(config: ProviderConfig, model: string, clearProvider: boolean) {
    if (!mainAgent || isApplyingConfigId) return;

    setIsApplyingConfigId(config.id);
    setError("");

    try {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: mainAgent.id,
          providerConfigId: clearProvider ? undefined : config.id,
          model: clearProvider ? undefined : model,
          clearProvider,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "更新主 Agent 模型失败。");
      }

      onMainAgentUpdated?.(data.agent);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "更新主 Agent 模型失败。");
    } finally {
      setIsApplyingConfigId("");
    }
  }

  function toggleConfigUsage(config: ProviderConfig) {
    const isActive = mainAgent?.provider_config_id === config.id;
    return applyConfigToMainAgent(config, selectedModels[config.id] || config.default_model, Boolean(isActive));
  }

  function updateDraft<Field extends keyof ProviderConfigDraft>(field: Field, value: ProviderConfigDraft[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function selectPreset(preset: ProviderPreset) {
    setDraft((current) => ({
      ...current,
      presetId: preset.id,
      apiBase: preset.apiBase,
      protocol: preset.protocol ?? "openai",
      authHeader: preset.authHeader ?? "authorization_bearer",
    }));
    setError("");
  }

  async function saveConfig() {
    if (!providerName) {
      setError("Provider 是必填项。");
      return;
    }

    if (draft.models.length === 0) {
      setError("至少需要填写一个 Model 名称。");
      return;
    }

    if (!apiBase) {
      setError("Custom Provider 需要填写 API Base。");
      return;
    }

    if (Object.values(draft.modelSettings).some(({ contextWindow }) => {
      const value = Number(contextWindow || 0);
      return contextWindow !== "" && (!Number.isSafeInteger(value) || value < 1 || value > 10_000_000);
    })) {
      setError("上下文大小需填写 1 到 10,000,000 之间的整数 token。");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/provider-configs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          name: draft.name,
          provider: providerName,
          model: draft.models[0],
          models: draft.models,
          modelSettings: serializeModelSettings(draft.modelSettings, draft.models),
          apiBase,
          apiKey: draft.apiKey,
          protocol,
          authHeader,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "保存 Provider 配置失败。");
      }

      const savedConfig = data.providerConfig as ProviderConfig;
      setConfigs((current) => {
        const exists = current.some((config) => config.id === savedConfig.id);
        return exists
          ? current.map((config) => (config.id === savedConfig.id ? savedConfig : config))
          : [savedConfig, ...current];
      });
      cancelEdit();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 Provider 配置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteConfig(configId: string) {
    setError("");

    try {
      const response = await fetch(`/api/provider-configs?id=${encodeURIComponent(configId)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "删除 Provider 配置失败。");
      }

      setConfigs((current) => current.filter((config) => config.id !== configId));

      if (editingId === configId) {
        cancelEdit();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除 Provider 配置失败。");
    }
  }

  function editConfig(config: ProviderConfig) {
    const preset = providerPresets.find((item) => item.id === config.provider) ?? providerPresets.at(-1) ?? providerPresets[0];
    const models = getConfigModels(config);

    setEditingId(config.id);
    setDraft({
      name: config.name || "",
      presetId: preset.id,
      customProvider: preset.id === "custom" ? config.provider : "",
      modelInput: "",
      models,
      modelSettings: normalizeModelSettings(config.model_settings, models),
      apiKey: config.api_key_env || "",
      apiBase: config.api_base || preset.apiBase,
      protocol: config.protocol === "anthropic" ? "anthropic" : "openai",
      authHeader: config.auth_header === "x-api-key" ? "x-api-key" : "authorization_bearer",
    });
    setError("");
  }

  function cancelEdit() {
    setEditingId("");
    setDraft(initialDraft);
  }

  function addModelsFromInput(value = draft.modelInput) {
    const nextModels = parseModelEntries(value);

    if (nextModels.length === 0) {
      return;
    }

    setDraft((current) => ({
      ...current,
      modelInput: "",
      models: Array.from(new Set([...current.models, ...nextModels])),
      modelSettings: {
        ...current.modelSettings,
        ...Object.fromEntries(nextModels.map((model) => [model, current.modelSettings[model] ?? { contextWindow: "" }])),
      },
    }));
    setError("");
  }

  function removeModel(model: string) {
    setDraft((current) => ({
      ...current,
      models: current.models.filter((item) => item !== model),
      modelSettings: Object.fromEntries(Object.entries(current.modelSettings).filter(([key]) => key !== model)),
    }));
    setError("");
  }

  return (
    <section className="model-service-layout mx-auto w-full">
      <div className="model-service-hero flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <span className="capability-hero__icon"><Cpu size={28} /></span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="capability-hero__title">模型服务</h1>
              <span className="capability-count">{configs.length} 个 Provider</span>
            </div>
            <p className="capability-hero__copy">统一接入、切换并管理 Agent 使用的模型能力。</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="capability-eyebrow hidden sm:block">MODEL · REASON · CREATE</p>
          {isLoading && <span className="theme-muted inline-flex items-center gap-2 text-[11px] font-semibold">
            <Loader2 className="animate-spin" size={14} />
            加载中
          </span>}
        </div>
      </div>

      <div className="model-service-form capability-glass-card rounded-[20px] border p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="theme-heading flex items-center gap-2 text-[14px] font-bold">
            <Sparkles size={16} className="text-[var(--app-primary)]" />
            {editingId ? "编辑 Provider" : "新增 Provider"}
          </h2>
          {editingId && (
            <button
              className="theme-button h-8 rounded-[9px] border px-3 text-[11px] font-bold transition"
              onClick={cancelEdit}
              type="button"
            >
              取消编辑
            </button>
          )}
        </div>

        <label className="mt-3 block">
          <span className="theme-muted-strong text-[11px] font-bold">Provider</span>
          <select
            className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none transition focus:border-[var(--app-primary)]"
            onChange={(event) => {
              const preset = providerPresets.find((item) => item.id === event.target.value);
              if (preset) selectPreset(preset);
            }}
            value={draft.presetId}
          >
            {providerPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="配置名称" onChange={(value) => updateDraft("name", value)} placeholder={`${selectedPreset.label} 工作模型`} value={draft.name} />
          {isCustom ? (
            <Field label="Provider 名称 *" onChange={(value) => updateDraft("customProvider", value)} placeholder="my-provider" value={draft.customProvider} />
          ) : null}
          <Field label="API Key" onChange={(value) => updateDraft("apiKey", value)} placeholder={selectedPreset.apiKeyPlaceholder} type="password" value={draft.apiKey} />
        </div>

        <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.42fr)]">
          {isCustom ? (
            <Field label="API Base *" onChange={(value) => updateDraft("apiBase", value)} placeholder="https://example.com/v1" value={draft.apiBase} />
          ) : (
            <ReadOnlyField label="API Base" value={selectedPreset.apiBase} />
          )}
          <label className="block min-w-0">
            <span className="theme-muted-strong text-[11px] font-bold">Models *</span>
            <div className="theme-input mt-2 flex h-10 min-w-0 gap-1.5 rounded-[10px] border p-1 transition focus-within:border-[var(--app-primary)]">
              <input
                className="min-w-0 flex-1 bg-transparent px-2 text-[12px] font-semibold text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
                onChange={(event) => updateDraft("modelInput", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addModelsFromInput();
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!/[\n,，]/.test(text)) {
                    return;
                  }
                  event.preventDefault();
                  addModelsFromInput(text);
                }}
                placeholder={selectedPreset.modelPlaceholder.split("\n")[0]}
                value={draft.modelInput}
              />
              <button
                className="theme-primary-bg inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] text-white transition"
                onClick={() => addModelsFromInput()}
                title="添加模型"
                type="button"
              >
                <Plus size={15} />
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4">
          <span className="theme-muted-strong text-[11px] font-bold">已添加模型</span>
          {draft.models.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {draft.models.map((model, index) => (
                <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-2.5 sm:flex-row sm:items-end" key={model}>
                  <div className="min-w-0 flex-1">
                    <span className="theme-heading block truncate text-[12px] font-semibold">{model}</span>
                    {index === 0 && <span className="theme-muted mt-0.5 block text-[10px] font-semibold">默认模型</span>}
                  </div>
                  <label className="block sm:w-[176px]">
                    <span className="theme-muted-strong text-[10px] font-bold">上下文大小（tokens）</span>
                    <input
                      className="theme-input mt-1 h-8 w-full rounded-[8px] border px-2 text-[11px] font-semibold outline-none transition placeholder:text-[var(--app-muted)] focus:border-[var(--app-primary)]"
                      inputMode="numeric"
                      min="1"
                      max="10000000"
                      onChange={(event) => updateDraft("modelSettings", {
                        ...draft.modelSettings,
                        [model]: { contextWindow: event.target.value.replace(/[^0-9]/g, "") },
                      })}
                      placeholder="例如 128000"
                      value={draft.modelSettings[model]?.contextWindow ?? ""}
                    />
                  </label>
                  <button
                    className="theme-button inline-flex size-8 shrink-0 items-center justify-center self-end rounded-[8px] border transition"
                    onClick={() => removeModel(model)}
                    title={`移除 ${model}`}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="theme-muted mt-2 block text-[11px] font-medium">尚未添加模型</span>
          )}
          <span className="theme-muted mt-2 block text-[10px] font-medium">
            输入一个模型后按 Enter 确认，也可以粘贴逗号或换行分隔的多个模型。上下文大小为可选项，按 token 填写；第一个模型会作为默认模型。
          </span>
        </div>

        {isCustom && (
          <div className="mt-4 grid gap-3 rounded-[12px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-3 sm:grid-cols-2">
            <SelectField
              label="Protocol"
              onChange={(value) => updateDraft("protocol", value as ProviderConfigDraft["protocol"])}
              options={[
                { label: "OpenAI Compatible", value: "openai" },
                { label: "Anthropic Messages", value: "anthropic" },
              ]}
              value={draft.protocol}
            />
            <SelectField
              label="Auth Header"
              onChange={(value) => updateDraft("authHeader", value as ProviderConfigDraft["authHeader"])}
              options={[
                { label: "Authorization: Bearer", value: "authorization_bearer" },
                { label: "x-api-key", value: "x-api-key" },
              ]}
              value={draft.authHeader}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-[10px] border border-[#ffd8df] bg-[#fff1f3] px-3 py-2 text-[11px] font-semibold text-[#b4233a]">
            {error}
          </p>
        )}

        <button
          className="theme-primary-bg mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[12px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isSaving}
          onClick={saveConfig}
          type="button"
        >
          {isSaving ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}
          {editingId ? "保存修改" : "保存 Provider"}
        </button>
      </div>

      <div className="model-service-library">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="theme-heading text-[15px] font-bold">已配置 Provider</h2>
            <p className="theme-muted mt-1 text-[11px] font-medium">选择模型并一键应用给主 Agent</p>
          </div>
          <span className="capability-count">{configs.length} 项</span>
        </div>
        {configs.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {configs.map((config) => {
              const selectedModel = selectedModels[config.id] || config.default_model;
              const isActive = mainAgent?.provider_config_id === config.id;

              return (
              <div className="model-provider-card rounded-[18px] border p-4" key={config.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="theme-heading text-[13px] font-bold">{config.name || displayProvider(config.provider)}</p>
                    <p className="theme-muted mt-1 truncate text-[11px] font-medium">
                      {displayProvider(config.provider)} · 当前 {selectedModel}
                    </p>
                    <p className="theme-muted mt-1 truncate text-[10px]">{config.api_base}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      aria-pressed={Boolean(isActive)}
                      className={`inline-flex h-9 min-w-[84px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border px-3 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isActive ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-[var(--app-primary-contrast)]" : "theme-button"
                      }`}
                      disabled={!mainAgent || Boolean(isApplyingConfigId)}
                      onClick={() => toggleConfigUsage(config)}
                      title={mainAgent ? (isActive ? "关闭主 Agent 对此模型的使用" : "将此模型应用给主 Agent") : "登录后可应用给主 Agent"}
                      type="button"
                    >
                      {isApplyingConfigId === config.id ? <Loader2 className="animate-spin" size={14} /> : null}
                      使用
                      <span aria-hidden="true" className={`relative h-4 w-7 rounded-full transition ${isActive ? "bg-white/35" : "bg-[var(--app-border)]"}`}>
                        <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition ${isActive ? "left-3.5" : "left-0.5"}`} />
                      </span>
                    </button>
                    <button
                      className="theme-button inline-flex size-9 items-center justify-center rounded-[9px] border transition"
                      onClick={() => editConfig(config)}
                      title="编辑配置"
                      type="button"
                    >
                      <Edit3 size={17} />
                    </button>
                    <button
                      className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#ffd8df] text-[#b4233a] transition hover:bg-[#fff1f3]"
                      onClick={() => deleteConfig(config.id)}
                      title="删除配置"
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getConfigModels(config).map((model) => (
                    <button
                      aria-pressed={model === selectedModel}
                      className={`model-tag rounded-full px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${
                        model === selectedModel ? "model-tag-default" : ""
                      }`}
                      key={model}
                      onClick={() => selectModel(config, model)}
                      title={`选择 ${model}`}
                      type="button"
                    >
                      {model}
                      {formatContextWindow(config.model_settings?.[model]?.context_window) && (
                        <span className="ml-1 opacity-70">· {formatContextWindow(config.model_settings?.[model]?.context_window)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          !isLoading && (
            <p className="theme-soft theme-muted-strong mt-3 rounded-[12px] border border-dashed px-4 py-3 text-[11px] font-medium">
              还没有配置 Provider。保存一个 Provider 后，创建 Agent 页面就可以选择它下面的模型。
            </p>
          )
        )}
      </div>
    </section>
  );
}

function parseModelEntries(value: string) {
  return Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function getConfigModels(config: ProviderConfig) {
  return Array.from(new Set([
    config.default_model,
    ...(config.models ?? []),
  ].filter(Boolean)));
}

function normalizeModelSettings(
  settings: ProviderConfig["model_settings"],
  models: string[],
): ProviderConfigDraft["modelSettings"] {
  return Object.fromEntries(models.map((model) => {
    const value = settings?.[model]?.context_window;
    return [model, { contextWindow: typeof value === "number" ? String(value) : "" }];
  }));
}

function serializeModelSettings(
  settings: ProviderConfigDraft["modelSettings"],
  models: string[],
) {
  return Object.fromEntries(models.flatMap((model) => {
    const contextWindow = Number(settings[model]?.contextWindow || 0);
    return Number.isSafeInteger(contextWindow) && contextWindow > 0
      ? [[model, { context_window: contextWindow }]]
      : [];
  }));
}

function formatContextWindow(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "";
  return value >= 1_000 ? `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K` : String(value);
}

function displayProvider(provider: string) {
  return providerPresets.find((preset) => preset.id === provider)?.label || provider;
}

function Field({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "password" | "text";
  value: string;
}) {
  return (
    <label className="block">
      <span className="theme-muted-strong text-[11px] font-bold">{label}</span>
      <input
        className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none transition placeholder:text-[var(--app-muted)] focus:border-[var(--app-primary)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="theme-muted-strong text-[11px] font-bold">{label}</span>
      <div className="theme-input theme-muted-strong mt-2 flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[11px] font-semibold">
        <KeyRound size={15} />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="theme-muted-strong text-[11px] font-bold">{label}</span>
      <select
        className="theme-input mt-2 h-10 w-full rounded-[10px] border px-3 text-[12px] font-semibold outline-none transition focus:border-[var(--app-primary)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
