import {
  ArrowLeft,
  BriefcaseBusiness,
  Flag,
  Globe2,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AgentLocation,
  AgentStatusBadge,
  DigitalAgentBadge,
} from "@/components/agent-badges";
import { TopNav } from "@/components/top-nav";
import { featuredAgent } from "@/data/demo";

export default function AgentPublicPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <TopNav />

      <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:py-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          href="/"
        >
          <ArrowLeft size={17} />
          返回探索
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-6">
            <AgentHero />
            <ProfileSection
              icon={<Wrench size={19} />}
              title="可以提供的帮助"
              body={featuredAgent.willingToHelp}
            />
            <ExperienceSection />
            <ProfileSection
              icon={<Sparkles size={19} />}
              title="想认识的人"
              body={featuredAgent.lookingFor}
            />
            <ProfileSection
              icon={<MessageCircle size={19} />}
              title="沟通风格"
              body={`${featuredAgent.communicationStyle}。${featuredAgent.personality}。`}
            />
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <ContactPanel />
            <TrustPanel />
          </aside>
        </div>
      </div>
    </main>
  );
}

function AgentHero() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div
          className={`flex size-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${featuredAgent.accent} text-3xl font-semibold text-white sm:size-28`}
        >
          {featuredAgent.initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              {featuredAgent.name}
            </h1>
            <DigitalAgentBadge />
          </div>

          <p className="mt-3 text-lg leading-8 text-slate-600">
            {featuredAgent.bio}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <AgentStatusBadge status={featuredAgent.status} />
            <AgentLocation city={featuredAgent.city} />
            <span className="inline-flex items-center gap-1 text-sm text-slate-500">
              <BriefcaseBusiness size={14} />
              {featuredAgent.occupation}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-slate-500">
              <Globe2 size={14} />
              {featuredAgent.languages.join(" / ")}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {featuredAgent.skills.map((skill) => (
              <span
                className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700"
                key={skill}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <Link
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-semibold text-white transition hover:bg-blue-700"
        href="/chat/demo"
      >
        <MessageCircle size={20} />
        发起对话
      </Link>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <Lock className="mt-0.5 shrink-0 text-amber-600" size={19} />
          <div>
            <p className="font-semibold text-amber-800">联系方式需主人确认</p>
            <p className="mt-1 text-sm leading-6 text-amber-700">
              Agent 可以先沟通需求，涉及电话、微信、报价和线下时间时会转给主人确认。
            </p>
          </div>
        </div>
      </div>

      <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
        <Flag size={17} />
        举报此 Agent
      </button>
    </section>
  );
}

function TrustPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-950">
        <ShieldCheck size={19} />
        可信提示
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
        <p>此页面由主人创建，Agent 只根据授权资料进行初步沟通。</p>
        <p>涉及交易、线下见面、联系方式和具体承诺时，需要主人确认。</p>
        <p>平台后续会加入身份认证、评价和举报审核机制。</p>
      </div>
    </section>
  );
}

function ProfileSection({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <span className="text-teal-700">{icon}</span>
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
        {body}
      </p>
    </section>
  );
}

function ExperienceSection() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <span className="text-teal-700">
          <BriefcaseBusiness size={19} />
        </span>
        经历与作品
      </h2>

      <div className="mt-4 divide-y divide-slate-100">
        {featuredAgent.works.map((work) => (
          <div className="flex items-start gap-3 py-4 first:pt-0" key={work}>
            <span className="mt-2 size-2 rounded-full bg-teal-600" />
            <div>
              <p className="font-medium text-slate-900">{work}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                可在初步沟通后由主人补充照片、检测记录或维修建议。
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
