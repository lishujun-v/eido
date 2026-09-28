"use client";

import { CircleX, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";

export type AuthUser = {
  id: string;
  email: string | null;
  name: string;
};

export function AuthDialog({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  onSignedIn: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitAuth() {
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, name, email, password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "登录失败，请稍后再试。");
      }

      onSignedIn(data.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "登录失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10172b]/35 px-4 backdrop-blur-sm">
      <section className="w-full max-w-[430px] rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_30px_90px_rgba(25,35,70,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-bold text-[#5362d8]">
              {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
              SiinX Account
            </p>
            <h2 className="mt-2 text-[24px] font-bold tracking-normal text-[#11182f]">
              {mode === "login" ? "登录账号" : "注册账号"}
            </h2>
          </div>
          <button
            className="flex size-9 items-center justify-center rounded-[10px] bg-[#f3f5fa] text-[#263049] transition hover:bg-[#e8ecf5]"
            onClick={onClose}
            type="button"
          >
            <CircleX size={19} />
          </button>
        </div>

        <div className="mt-5 grid h-11 grid-cols-2 rounded-[14px] bg-[#eef2fb] p-1 text-[14px] font-bold text-[#6d778e]">
          <button
            className={`rounded-[11px] transition ${mode === "login" ? "bg-white text-[#3154eb] shadow-sm" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
            type="button"
          >
            登录
          </button>
          <button
            className={`rounded-[11px] transition ${mode === "register" ? "bg-white text-[#3154eb] shadow-sm" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
            type="button"
          >
            注册
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {mode === "register" && (
            <AuthField
              label="昵称"
              onChange={setName}
              placeholder="例如：SJL"
              value={name}
            />
          )}
          <AuthField
            label="邮箱"
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
          <AuthField
            label="密码"
            onChange={setPassword}
            placeholder="至少 4 位"
            type="password"
            value={password}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-[12px] border border-[#ffd8df] bg-[#fff1f3] px-4 py-3 text-[13px] font-semibold text-[#b4233a]">
            {error}
          </p>
        )}

        <button
          className="mt-5 flex h-12 w-full items-center justify-center rounded-[13px] bg-[#5d61f5] text-[15px] font-bold text-white shadow-[0_14px_28px_rgba(76,83,229,0.26)] transition hover:bg-[#4f55ee] disabled:cursor-not-allowed disabled:bg-[#b9bfd4]"
          disabled={isSubmitting}
          onClick={submitAuth}
          type="button"
        >
          {isSubmitting ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
        </button>
      </section>
    </div>
  );
}

function AuthField({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-[#303a54]">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-[13px] border border-[#dfe5f0] bg-white px-4 text-[15px] font-medium text-[#12182b] outline-none transition placeholder:text-[#98a2b7] focus:border-[#8da0ff] focus:ring-4 focus:ring-[#edf1ff]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
