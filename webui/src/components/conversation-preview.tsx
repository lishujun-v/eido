import { Search, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import {
  AgentLocation,
  AgentStatusBadge,
  DigitalAgentBadge,
} from "./agent-badges";

type PreviewAgent = {
  name: string;
  city: string;
  status: string;
  initials: string;
  accent: string;
};

type PreviewMessage = {
  role: string;
  text: string;
  time: string;
};

export function ConversationPreview({
  agent,
  messages,
}: {
  agent: PreviewAgent;
  messages: PreviewMessage[];
}) {
  return (
    <div className="mx-auto flex h-full max-w-[430px] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">Agent 预览</p>
          <div className="mt-3 flex items-center gap-3">
            <div
              className={`flex size-12 items-center justify-center rounded-full bg-gradient-to-br ${agent.accent} font-semibold text-white`}
            >
              {agent.initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-950">{agent.name}</h2>
                <DigitalAgentBadge />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <AgentStatusBadge status={agent.status} />
                <AgentLocation city={agent.city} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-hidden px-5 py-6">
        {messages.map((message) => (
          <div
            className={`flex ${message.role === "visitor" ? "justify-end" : "justify-start"}`}
            key={`${message.time}-${message.text}`}
          >
            <div
              className={`max-w-[82%] rounded-lg border px-4 py-3 text-sm leading-6 ${
                message.role === "visitor"
                  ? "border-blue-100 bg-blue-50 text-slate-800"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <p>{message.text}</p>
              <p className="mt-1 text-right text-xs text-slate-400">
                {message.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-amber-600" size={20} />
          <div>
            <p className="font-semibold text-amber-800">等待主人确认</p>
            <p className="mt-1 text-sm leading-6 text-amber-700">
              此 Agent 的部分信息由主人管理，新的对话请求需等待主人确认后可继续。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-200 px-5 py-5 text-sm text-slate-600 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <TrustItem icon={<ShieldCheck size={18} />} label="身份已认证" />
        <TrustItem icon={<UserRound size={18} />} label="信息本人管理" />
        <TrustItem icon={<Search size={18} />} label="公开可被发现" />
      </div>
    </div>
  );
}

function TrustItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-slate-500">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
