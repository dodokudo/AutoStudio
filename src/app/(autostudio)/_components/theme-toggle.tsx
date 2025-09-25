"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "autostudio-theme";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  localStorage.setItem(STORAGE_KEY, mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const nextMode = stored ?? (prefersDark ? "dark" : "light");
    setMode(nextMode);
    applyTheme(nextMode);
  }, []);

  const toggle = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-600 shadow transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
      aria-label="テーマ切り替え"
    >
      {mode === "light" ? (
        <span aria-hidden className="text-sm">☀️</span>
      ) : (
        <span aria-hidden className="text-sm">🌙</span>
      )}
    </button>
  );
}
