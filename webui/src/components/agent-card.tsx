import { MessageCircle } from "lucide-react";
import Link from "next/link";
import {
  AgentLocation,
  AgentStatusBadge,
  DigitalAgentBadge,
} from "./agent-badges";

export type AgentCardData = {
  name: string;
  slug: string;
  city: string;
  status: string;
  initials: string;
  accent: string;
  skills: string[];
  bio: string;
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <article className="theme-card rounded-[16px] border p-5 transition hover:-translate-y-0.5 hover:border-[var(--app-primary)] hover:shadow-[var(--app-shadow)]">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${agent.accent} text-xl font-semibold text-white`}
        >
          {agent.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="theme-heading truncate text-lg font-semibold tracking-[-0.02em]">
              {agent.name}
            </h3>
            <DigitalAgentBadge />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <AgentStatusBadge status={agent.status} />
            <AgentLocation city={agent.city} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {agent.skills.map((skill) => (
          <span
            className="theme-primary-soft rounded-md px-2.5 py-1 text-xs font-semibold"
            key={skill}
          >
            {skill}
          </span>
        ))}
      </div>

      <p className="theme-muted mt-4 min-h-12 text-sm leading-6">
        {agent.bio}
      </p>

      <Link
        className="theme-button mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border text-sm font-semibold transition hover:border-[var(--app-primary)]"
        href={`/agents/${agent.slug}`}
      >
        <MessageCircle size={17} />
        发消息
      </Link>
    </article>
  );
}
