import { MapPin } from "lucide-react";

export function DigitalAgentBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
      数字代理
    </span>
  );
}

export function AgentStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
      <span className="size-2 rounded-full bg-green-500" />
      {status}
    </span>
  );
}

export function AgentLocation({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-500">
      <MapPin size={14} />
      {city}
    </span>
  );
}
