"use client";

import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  Loader2,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { DigitalAgentBadge } from "@/components/agent-badges";

type AvatarPreset = {
  id: string;
  label: string;
  emoji: string;
  gradient: string;
};

type DraftAvatar = {
  type: "preset" | "upload";
  presetId?: string;
  dataUrl?: string;
  fileName?: string;
};

type ProviderConfig = {
  id: string;
  name: string;
  provider: string;
  default_model: string;
  models?: string[];
  api_base: string;
  api_key_env: string;
  protocol: string;
  auth_header: string;
};

type DraftAgent = {
  name: string;
  identity: string;
  capabilities: string;
  avatar: DraftAvatar;
  city: string;
  occupation: string;
  values: string;
  speakingStyle: string;
  boundaries: string;
  handoffPolicy: string;
  visibility: "private" | "unlisted" | "public";
};

type ToastMessage = {
  type: "success" | "error";
  message: string;
};

const avatarPresets: AvatarPreset[] = [
  {
    id: "focus",
    label: "专注",
    emoji: "研",
    gradient: "from-slate-900 via-blue-700 to-teal-500",
  },
  {
    id: "warm",
    label: "温和",
    emoji: "助",
    gradient: "from-rose-400 via-orange-300 to-amber-300",
  },
  {
    id: "creative",
    label: "创意",
    emoji: "创",
    gradient: "from-fuchsia-500 via-indigo-500 to-cyan-400",
  },
  {
    id: "calm",
    label: "清晰",
    emoji: "析",
    gradient: "from-emerald-500 via-cyan-500 to-sky-500",
  },
  {
    id: "ops",
    label: "执行",
    emoji: "行",
    gradient: "from-zinc-800 via-slate-600 to-lime-500",
  },
  {
    id: "guide",
    label: "向导",
    emoji: "问",
    gradient: "from-violet-500 via-blue-500 to-indigo-700",
  },
];

const initialDraft: DraftAgent = {
  name: "我的研究助理",
  identity: "我是一个帮助整理信息、分析问题和生成文档草稿的个人 Agent。",
  capabilities:
    "可以进行资料整理、任务拆解、方案比较、对话总结和轻量内容生成。遇到需要外部权限、账号、付款或最终承诺的事项时，会请求真人确认。",
  avatar: {
    type: "preset",
    presetId: "focus",
  },
  city: "",
  occupation: "个人效率助理",
  values: "真诚, 边界清晰, 可验证优先",
  speakingStyle: "自然、简洁、会先澄清需求再行动",
  boundaries: "涉及联系方式、报价、线下见面和具体承诺时，需要真人确认。",
  handoffPolicy: "当访客明确希望联系真人，或问题超出 Agent 可回答范围时，建议发起真人接入。",
  visibility: "private",
};

export function NewAgentForm({ onCreated }: { onCreated?: (agent: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState<DraftAgent>(initialDraft);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [selectedProviderConfigId, setSelectedProviderConfigId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [runtimeKind, setRuntimeKind] = useState<"eido-local" | "remote-ndjson">("eido-local");
  const [remoteEndpoint, setRemoteEndpoint] = useState("");
  const [remoteAgentId, setRemoteAgentId] = useState("");
  const [isLoadingProviderConfigs, setIsLoadingProviderConfigs] = useState(true);
  const [providerConfigError, setProviderConfigError] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const selectedProviderConfig = providerConfigs.find((config) => config.id === selectedProviderConfigId) ?? null;
  const missingRequired = getMissingRequired(draft, selectedProviderConfigId, selectedModel, runtimeKind, remoteEndpoint);
  const canCreate = missingRequired.length === 0 && !isCreating && (runtimeKind === "remote-ndjson" || !isLoadingProviderConfigs);
  const values = splitTags(draft.values);
  const selectedPreset =
    avatarPresets.find((preset) => preset.id === draft.avatar.presetId) ?? avatarPresets[0];

  function updateField<Field extends keyof DraftAgent>(field: Field, value: DraftAgent[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  }

  const loadProviderConfigs = useCallback(async () => {
    setIsLoadingProviderConfigs(true);
    setProviderConfigError("");

    try {
      const response = await fetch("/api/provider-configs", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "读取 Provider 配置失败。");
      }

      const configs = Array.isArray(data?.providerConfigs) ? data.providerConfigs : [];
      setProviderConfigs(configs);
      const nextId = selectedProviderConfigId || configs[0]?.id || "";
      const nextConfig = configs.find((config: ProviderConfig) => config.id === nextId);
      setSelectedProviderConfigId(nextId);
      setSelectedModel(selectedModel || getConfigModels(nextConfig)[0] || "");
    } catch (loadError) {
      setProviderConfigError(loadError instanceof Error ? loadError.message : "读取 Provider 配置失败。");
    } finally {
      setIsLoadingProviderConfigs(false);
    }
  }, [selectedModel, selectedProviderConfigId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProviderConfigs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProviderConfigs]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function selectPresetAvatar(presetId: string) {
    updateField("avatar", {
      type: "preset",
      presetId,
    });
  }

  function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件作为头像。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField("avatar", {
        type: "upload",
        dataUrl: String(reader.result),
        fileName: file.name,
      });
    };
    reader.onerror = () => {
      setError("头像读取失败，请换一张图片再试。");
    };
    reader.readAsDataURL(file);
  }

  async function createAgent() {
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    setError("");
    setToast(null);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          identity: draft.identity,
          capabilities: draft.capabilities,
          avatar: buildAvatarPayload(draft.avatar),
          providerConfigId: selectedProviderConfigId,
          model: selectedModel,
          runtime: runtimeKind === "remote-ndjson"
            ? { kind: runtimeKind, endpoint: remoteEndpoint, remoteAgentId }
            : { kind: runtimeKind },
          city: draft.city,
          occupation: draft.occupation,
          speakingStyle: draft.speakingStyle,
          values,
          boundaries: draft.boundaries,
          handoffPolicy: draft.handoffPolicy,
          visibility: draft.visibility,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "创建 Agent 失败。");
      }

      setToast({ type: "success", message: `Agent「${data.agent.name}」创建成功` });
      if (data?.agent && typeof data.agent === "object") {
        onCreated?.(data.agent as Record<string, unknown>);
      }
    } catch (createError) {
      setToast({
        type: "error",
        message: createError instanceof Error ? createError.message : "创建 Agent 失败。",
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">
              <Sparkles size={15} />
              创建 Agent
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
              快速创建 Agent
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              先配置可用 Provider 和模型，然后创建 Agent 时只选择一个已配置模型。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            必填完成 {5 - missingRequired.length}/5
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <AvatarPreview avatar={draft.avatar} fallback={draft.name} preset={selectedPreset} size="large" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-950">头像</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                上传一张本地图片，或从预置头像里选一个。
              </p>
              {draft.avatar.type === "upload" && draft.avatar.fileName && (
                <p className="mt-1 truncate text-xs font-medium text-blue-700">
                  已选择：{draft.avatar.fileName}
                </p>
              )}
            </div>
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              <Upload size={17} />
              本地上传
              <input accept="image/*" className="sr-only" onChange={uploadAvatar} type="file" />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {avatarPresets.map((preset) => {
              const active = draft.avatar.type === "preset" && draft.avatar.presetId === preset.id;
              return (
                <button
                  aria-label={`选择${preset.label}头像`}
                  className={`flex h-16 items-center justify-center rounded-lg border transition ${
                    active
                      ? "border-blue-300 bg-blue-50 ring-4 ring-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  key={preset.id}
                  onClick={() => selectPresetAvatar(preset.id)}
                  title={preset.label}
                  type="button"
                >
                  <span
                    className={`flex size-10 items-center justify-center rounded-full bg-gradient-to-br ${preset.gradient} text-sm font-semibold text-white`}
                  >
                    {preset.emoji}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Agent 名称 *"
            onChange={(value) => updateField("name", value)}
            placeholder="例如：研究助理"
            value={draft.name}
          />
          <Field
            label="职业 / 角色"
            onChange={(value) => updateField("occupation", value)}
            placeholder="例如：资料研究与写作助理"
            value={draft.occupation}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <TextArea
            label="身份信息 *"
            onChange={(value) => updateField("identity", value)}
            placeholder="这个 Agent 是谁，代表谁或负责什么任务"
            value={draft.identity}
          />
          <TextArea
            label="能力描述 *"
            onChange={(value) => updateField("capabilities", value)}
            placeholder="能做什么、擅长什么、可处理哪些输入和产出"
            value={draft.capabilities}
          />
        </div>

        <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Agent Server</h2>
            {runtimeKind === "eido-local" && isLoadingProviderConfigs && (
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                <Loader2 className="animate-spin" size={15} />
                读取中
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button className={`rounded-md px-3 py-2 text-sm font-medium ${runtimeKind === "eido-local" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`} onClick={() => setRuntimeKind("eido-local")} type="button">内置 Eido</button>
            <button className={`rounded-md px-3 py-2 text-sm font-medium ${runtimeKind === "remote-ndjson" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`} onClick={() => setRuntimeKind("remote-ndjson")} type="button">远程 Server</button>
          </div>

          {runtimeKind === "eido-local" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SelectField
              disabled={isLoadingProviderConfigs || providerConfigs.length === 0}
              label="Provider"
              onChange={(providerId) => {
                const config = providerConfigs.find((item) => item.id === providerId);
                setSelectedProviderConfigId(providerId);
                setSelectedModel(getConfigModels(config)[0] || "");
                setError("");
              }}
              options={providerConfigs.map((config) => ({
                label: config.name || config.provider,
                value: config.id,
              }))}
              placeholder="选择 Provider"
              value={selectedProviderConfigId}
            />
            <SelectField
              disabled={!selectedProviderConfig}
              label="Model"
              onChange={setSelectedModel}
              options={getConfigModels(selectedProviderConfig).map((model) => ({
                label: model,
                value: model,
              }))}
              placeholder="选择 Model"
              value={selectedModel}
            />
          </div> : <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Server 地址 *" onChange={setRemoteEndpoint} placeholder="http://127.0.0.1:8010" value={remoteEndpoint} />
            <Field label="远程 Agent ID" onChange={setRemoteAgentId} placeholder="不填则使用本平台 Agent ID" value={remoteAgentId} />
          </div>}

          {runtimeKind === "eido-local" && providerConfigError && (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {providerConfigError}
            </p>
          )}

          {runtimeKind === "eido-local" && !isLoadingProviderConfigs && providerConfigs.length === 0 && (
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">
                还没有可用的 Provider 配置，请先在 Settings 中完成模型配置。
              </p>
            </div>
          )}
        </section>

        <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block font-semibold text-slate-950">更多资料</span>
              <span className="mt-1 block text-sm text-slate-500">城市、价值观、说话风格、边界和真人接入策略。</span>
            </span>
            <ChevronDown className="shrink-0 text-slate-500" size={19} />
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="城市 / 时区"
              onChange={(value) => updateField("city", value)}
              placeholder="例如：上海 · UTC+8"
              value={draft.city}
            />
            <Field
              label="价值观标签"
              onChange={(value) => updateField("values", value)}
              placeholder="用逗号分隔"
              value={draft.values}
            />
          </div>
          <div className="mt-4 grid gap-4">
            <TextArea
              label="说话风格"
              onChange={(value) => updateField("speakingStyle", value)}
              placeholder="例如：直接、耐心、先给结论再给依据"
              value={draft.speakingStyle}
            />
            <TextArea
              label="Agent 边界"
              onChange={(value) => updateField("boundaries", value)}
              placeholder="每行一条，说明哪些事情不能做或必须交给真人确认"
              value={draft.boundaries}
            />
            <TextArea
              label="真人接入策略"
              onChange={(value) => updateField("handoffPolicy", value)}
              placeholder="什么时候建议 handoff 给真人"
              value={draft.handoffPolicy}
            />
          </div>
        </details>

        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block font-semibold text-slate-950">可见性</span>
              <span className="mt-1 block text-sm text-slate-500">默认私有，准备好之后再公开。</span>
            </span>
            <ChevronDown className="shrink-0 text-slate-500" size={19} />
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["private", "unlisted", "public"] as const).map((visibility) => (
              <button
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  draft.visibility === visibility
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-white"
                }`}
                key={visibility}
                onClick={() => updateField("visibility", visibility)}
                type="button"
              >
                <span className="block text-sm font-semibold">{visibilityLabel(visibility)}</span>
                <span className="mt-1 block text-xs leading-5">{visibilityHelp(visibility)}</span>
              </button>
            ))}
          </div>
        </details>

        {error && (
          <p className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {missingRequired.length > 0 && (
          <p className="mt-5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            还需要填写：{missingRequired.join("、")}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canCreate}
            onClick={createAgent}
            type="button"
          >
            {isCreating ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            创建 Agent
          </button>
        </div>
      </section>

      <aside className="self-start lg:sticky lg:top-0">
        <AgentPreviewCard
          draft={draft}
          model={selectedModel}
          preset={selectedPreset}
          provider={selectedProviderConfig?.provider || ""}
          values={values}
        />
      </aside>

      {toast && <AgentToast onClose={() => setToast(null)} toast={toast} />}
    </div>
  );
}

function AgentPreviewCard({
  draft,
  model,
  preset,
  provider,
  values,
}: {
  draft: DraftAgent;
  model: string;
  preset: AvatarPreset;
  provider: string;
  values: string[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
      <div className={`relative bg-gradient-to-br ${preset.gradient} px-5 pb-6 pt-5 text-white`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.34),transparent_42%)]" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
            Live Agent Card
          </span>
          <DigitalAgentBadge />
        </div>
        <div className="relative mt-7 flex items-end gap-4">
          <div className="rounded-full border-4 border-white/70 shadow-lg">
            <AvatarPreview avatar={draft.avatar} fallback={draft.name} preset={preset} size="large" />
          </div>
          <div className="min-w-0 pb-1">
            <h2 className="truncate text-xl font-bold">{draft.name || "未命名 Agent"}</h2>
            <p className="mt-1 truncate text-sm text-white/80">{draft.occupation || "尚未填写角色"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <PreviewSection
          fallback="填写左侧身份信息后，将在这里实时呈现 Agent 的角色定位。"
          label="身份"
          value={draft.identity}
        />
        <PreviewSection
          fallback="尚未填写能力描述"
          label="核心能力"
          value={draft.capabilities}
        />

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">价值观</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(values.length ? values : ["尚未添加"]).map((value) => (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" key={value}>
                {value}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
          <PreviewMeta label="位置" value={draft.city || "未设置"} />
          <PreviewMeta label="可见性" value={visibilityLabel(draft.visibility)} />
          <PreviewMeta label="Provider" value={provider || "未选择"} />
          <PreviewMeta label="Model" value={model || "未选择"} />
        </div>

        {draft.speakingStyle && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">沟通风格</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">{draft.speakingStyle}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewSection({ fallback, label, value }: { fallback: string; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-2 text-sm leading-6 ${value ? "text-slate-700" : "text-slate-400"}`}>
        {value || fallback}
      </p>
    </div>
  );
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-700" title={value}>{value}</p>
    </div>
  );
}

function AgentToast({ onClose, toast }: { onClose: () => void; toast: ToastMessage }) {
  const success = toast.type === "success";
  return (
    <div
      aria-live="polite"
      className={`fixed bottom-8 right-8 z-[200] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ${
        success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
      role="status"
    >
      {success ? <CheckCircle2 className="mt-0.5 shrink-0" size={19} /> : <CircleX className="mt-0.5 shrink-0" size={19} />}
      <p className="text-sm font-semibold leading-5">{toast.message}</p>
      <button aria-label="关闭提示" className="ml-1 opacity-60 transition hover:opacity-100" onClick={onClose} type="button">
        <CircleX size={17} />
      </button>
    </div>
  );
}

function AvatarPreview({
  avatar,
  fallback,
  preset,
  size = "normal",
}: {
  avatar: DraftAvatar;
  fallback: string;
  preset: AvatarPreset;
  size?: "normal" | "large";
}) {
  const dimension = size === "large" ? "size-20 text-2xl" : "size-14 text-xl";
  const label = preset.emoji || fallback.trim().slice(0, 1) || "A";

  return (
    <div
      className={`flex ${dimension} shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${preset.gradient} font-semibold text-white`}
    >
      {avatar.type === "upload" && avatar.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="Agent 头像预览" className="h-full w-full object-cover" src={avatar.dataUrl} />
      ) : (
        label
      )}
    </div>
  );
}

function buildAvatarPayload(avatar: DraftAvatar) {
  if (avatar.type === "upload" && avatar.dataUrl) {
    return {
      type: "upload",
      data_url: avatar.dataUrl,
      file_name: avatar.fileName ?? "",
    };
  }

  const preset = avatarPresets.find((item) => item.id === avatar.presetId) ?? avatarPresets[0];
  return {
    type: "preset",
    preset_id: preset.id,
    label: preset.label,
    emoji: preset.emoji,
    gradient: preset.gradient,
  };
}

function SelectField({
  disabled,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          className="h-10 w-full appearance-none truncate rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      </span>
    </label>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function getMissingRequired(
  draft: DraftAgent,
  selectedProviderConfigId: string,
  selectedModel: string,
  runtimeKind: "eido-local" | "remote-ndjson",
  remoteEndpoint: string,
) {
  return [
    ["Agent 名称", draft.name.trim()],
    ["身份信息", draft.identity.trim()],
    ["能力描述", draft.capabilities.trim()],
    ...(runtimeKind === "eido-local"
      ? [["默认模型", selectedProviderConfigId], ["具体模型", selectedModel]]
      : [["Server 地址", remoteEndpoint.trim()]]),
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);
}

function getConfigModels(config: ProviderConfig | undefined | null) {
  if (!config) {
    return [];
  }

  return Array.from(new Set([
    config.default_model,
    ...(config.models ?? []),
  ].filter(Boolean)));
}

function splitTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function visibilityLabel(visibility: DraftAgent["visibility"]) {
  return {
    private: "私有",
    unlisted: "未列出",
    public: "公开",
  }[visibility];
}

function visibilityHelp(visibility: DraftAgent["visibility"]) {
  return {
    private: "仅本机管理",
    unlisted: "可链接访问",
    public: "可进入目录",
  }[visibility];
}
