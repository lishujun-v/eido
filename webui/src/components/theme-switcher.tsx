"use client";

import { Check, ChevronDown, ImageIcon, Moon, RotateCcw, SunMedium, Upload } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type ThemeName = "light" | "dark";

const storageKey = "eido-theme";
const backgroundStorageKey = "eido-chat-background";
const backgroundBlurStorageKey = "eido-chat-background-blur";
const defaultBackground = "/siinx-future-workspace.png";
const maxBackgroundFileSize = 12 * 1024 * 1024;

const themes: Array<{
  name: ThemeName;
  label: string;
  icon: typeof SunMedium;
}> = [
  { name: "light", label: "日间模式", icon: SunMedium },
  { name: "dark", label: "夜间模式", icon: Moon },
];

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new Event("eido-theme-change"));
}

function readStoredTheme(): ThemeName {
  const stored = localStorage.getItem(storageKey);
  if (stored === "dark") return "dark";
  if (stored !== "light") localStorage.setItem(storageKey, "light");
  return "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("eido-theme-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("eido-theme-change", onStoreChange);
  };
}

export function ThemeSwitcher({
  compact = false,
  menu = false,
}: {
  compact?: boolean;
  menu?: boolean;
}) {
  // The server snapshot keeps hydration stable; React reads localStorage after
  // hydration while layout.tsx applies the same stored theme before paint.
  const theme = useSyncExternalStore<ThemeName>(subscribeToTheme, readStoredTheme, () => "light");

  if (menu) {
    return (
      <div>
        <ThemeMenuSelect theme={theme} />
        <BackgroundCustomizer />
      </div>
    );
  }

  return (
    <div
      aria-label="切换主题"
      className={`theme-switcher grid shrink-0 grid-cols-2 rounded-[12px] p-1 ${
        compact ? "h-10 w-[176px]" : "h-11 w-full"
      }`}
      role="group"
    >
      {themes.map((item) => {
        const Icon = item.icon;
        const active = theme === item.name;

        return (
          <button
            aria-pressed={active}
            className={`flex items-center justify-center gap-1.5 rounded-[9px] text-[12px] font-bold transition ${
              compact ? "px-0" : "px-2"
            }`}
            data-active={active}
            key={item.name}
            onClick={() => {
              applyTheme(item.name);
            }}
            title={item.label}
            type="button"
          >
            <Icon size={15} />
            {!compact && <span>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ThemeMenuSelect({ theme }: { theme: ThemeName }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedTheme = themes.find((item) => item.name === theme) ?? themes[0];
  const SelectedIcon = selectedTheme.icon;

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="account-theme-field" ref={rootRef}>
      <span className="theme-muted mb-2 block text-[12px] font-bold" id="account-theme-label">界面主题</span>
      <div className="relative">
        <button
          aria-controls="account-theme-options"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby="account-theme-label account-theme-value"
          className="account-theme-trigger"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="theme-primary-soft flex size-7 shrink-0 items-center justify-center rounded-[8px]">
            <SelectedIcon size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold" id="account-theme-value">
            {selectedTheme.label}
          </span>
          <ChevronDown aria-hidden="true" className={`theme-muted shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} size={16} />
        </button>

        {open && (
          <div
            aria-labelledby="account-theme-label"
            className="account-theme-options"
            id="account-theme-options"
            role="listbox"
          >
            {themes.map((item) => {
              const Icon = item.icon;
              const selected = item.name === theme;
              return (
                <button
                  aria-selected={selected}
                  className="account-theme-option"
                  key={item.name}
                  onClick={() => {
                    applyTheme(item.name);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="account-theme-option__icon"><Icon size={15} /></span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {selected && <Check aria-hidden="true" size={15} strokeWidth={2.4} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BackgroundCustomizer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [background, setBackground] = useState("");
  const [blur, setBlur] = useState(0);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const storedBackground = localStorage.getItem(backgroundStorageKey) || "";
    const storedBlur = clampBlur(localStorage.getItem(backgroundBlurStorageKey));
    setBackground(storedBackground);
    setBlur(storedBlur);
    applyChatBackground(storedBackground, storedBlur);
  }, []);

  async function handleBackgroundSelected(file?: File) {
    if (!file) return;
    setError("");

    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > maxBackgroundFileSize) {
      setError("图片不能超过 12 MB。");
      return;
    }

    setIsProcessing(true);
    try {
      const prepared = await prepareBackgroundImage(file);
      try {
        localStorage.setItem(backgroundStorageKey, prepared);
      } catch {
        throw new Error("图片保存空间不足，请选择尺寸更小的图片。");
      }
      setBackground(prepared);
      applyChatBackground(prepared, blur);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "背景图片处理失败。");
    } finally {
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateBlur(nextBlur: number) {
    setBlur(nextBlur);
    localStorage.setItem(backgroundBlurStorageKey, String(nextBlur));
    applyChatBackground(background, nextBlur);
  }

  function resetBackground() {
    localStorage.removeItem(backgroundStorageKey);
    setBackground("");
    setError("");
    applyChatBackground("", blur);
  }

  return (
    <div className="mt-4 border-t border-[var(--app-border)] pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="theme-muted text-[12px] font-bold">工作区背景</span>
        {background && (
          <button
            aria-label="恢复默认工作区背景"
            className="theme-muted inline-flex items-center gap-1 text-[11px] font-semibold transition hover:text-[var(--app-primary-strong)]"
            onClick={resetBackground}
            type="button"
          >
            <RotateCcw size={12} />
            恢复默认
          </button>
        )}
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => { void handleBackgroundSelected(event.target.files?.[0]); }}
        ref={inputRef}
        type="file"
      />
      <button
        className="background-upload-control flex w-full items-center gap-3 rounded-[11px] border p-2 text-left transition"
        disabled={isProcessing}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span
          aria-hidden="true"
          className="background-upload-preview block size-11 shrink-0 rounded-[8px]"
          style={{ backgroundImage: `url(${background || defaultBackground})` }}
        />
        <span className="min-w-0 flex-1">
          <span className="theme-heading block text-[12px] font-bold">
            {isProcessing ? "正在处理图片…" : background ? "替换背景图片" : "上传背景图片"}
          </span>
          <span className="theme-muted mt-0.5 block text-[10px] font-medium">JPG、PNG 或 WebP，最大 12 MB</span>
        </span>
        {isProcessing ? <span className="size-4 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-primary)]" /> : <Upload className="theme-muted shrink-0" size={16} />}
      </button>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="theme-muted inline-flex items-center gap-1.5 text-[11px] font-semibold" htmlFor="chat-background-blur">
            <ImageIcon size={13} />
            背景虚化
          </label>
          <output className="theme-heading text-[11px] font-bold tabular-nums" htmlFor="chat-background-blur">{blur}px</output>
        </div>
        <input
          aria-label="背景虚化程度"
          className="background-blur-range block w-full"
          id="chat-background-blur"
          max="24"
          min="0"
          onChange={(event) => updateBlur(Number(event.target.value))}
          step="1"
          type="range"
          value={blur}
        />
      </div>
      <p className={`mt-2 text-[10px] font-medium leading-4 ${error ? "text-[#c43d52]" : "theme-muted"}`} aria-live="polite">
        {error || "图片仅保存在当前浏览器，并应用到所有主要页面。"}
      </p>
    </div>
  );
}

function applyChatBackground(background: string, blur: number) {
  const root = document.documentElement;
  if (background) {
    root.style.setProperty("--chat-background-image", `url("${background}")`);
  } else {
    root.style.removeProperty("--chat-background-image");
  }
  root.style.setProperty("--chat-background-blur", `${blur}px`);
}

function clampBlur(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(24, Math.max(0, Math.round(parsed))) : 0;
}

async function prepareBackgroundImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理这张图片。");
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/webp", 0.78);
    if (!dataUrl.startsWith("data:image/")) throw new Error("背景图片处理失败。");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片，请尝试其他文件。"));
    image.src = src;
  });
}
