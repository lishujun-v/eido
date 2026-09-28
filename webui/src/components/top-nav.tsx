"use client";

import { Bot, Cpu, Plus, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthDialog, type AuthUser } from "@/components/auth-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function TopNav() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.authenticated) {
          setAuthUser(data.user);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="theme-card sticky top-0 z-20 border-b backdrop-blur">
      <nav className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8">
        <Link className="flex items-center gap-3" href="/">
          <div className="brand-mark flex size-9 items-center justify-center rounded-[11px]">
            <Bot size={21} strokeWidth={2.3} />
          </div>
          <div className="flex items-center gap-4">
            <span className="theme-heading text-[22px] font-semibold tracking-[-0.04em]">SiinX</span>
            <span className="theme-divider hidden h-5 w-px sm:block" />
            <span className="theme-muted hidden text-sm sm:block">
              数字分身 Agent 平台
            </span>
          </div>
        </Link>

        <div className="theme-muted-strong hidden items-center gap-7 text-sm font-medium md:flex">
          <Link
            className="flex items-center gap-2 transition hover:text-[var(--app-text-strong)]"
            href="/"
          >
            <Search size={18} />
            探索 Agent
          </Link>
          <Link
            className="flex items-center gap-2 transition hover:text-[var(--app-text-strong)]"
            href="/agents/new"
          >
            <Plus size={18} />
            创建我的 Agent
          </Link>
          <Link
            className="flex items-center gap-2 transition hover:text-[var(--app-text-strong)]"
            href="/settings/models"
          >
            <Cpu size={18} />
            模型配置
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeSwitcher compact />
          <button
            className="theme-button inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition"
            onClick={() => setAuthModalOpen(true)}
            type="button"
          >
            <UserRound size={18} />
            {authUser ? authUser.name || authUser.email : "登录"}
          </button>
        </div>
      </nav>
      {authModalOpen && (
        <AuthDialog
          onClose={() => setAuthModalOpen(false)}
          onSignedIn={(user) => {
            setAuthUser(user);
            setAuthModalOpen(false);
          }}
        />
      )}
    </header>
  );
}
