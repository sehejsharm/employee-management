"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/menu";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem("fr-theme");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "light";
}

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Puts the right class on <html>. Transitions are suppressed for the instant of the switch. */
function applyTheme(p: ThemePreference) {
  const dark = p === "dark" || (p === "system" && systemDark());
  const root = document.documentElement;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#060a13" : "#f5f7fb");
  if (root.classList.contains("dark") === dark) return;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

/*
 * The theme lives in the browser (localStorage + the class the boot script
 * set on <html>), so React reads it as an external store: no effects, no
 * flash, and other tabs stay in sync through the storage event.
 */
const themeListeners = new Set<() => void>();

function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") applyTheme("system");
    onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== "fr-theme") return;
    applyTheme(readPreference());
    onChange();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    themeListeners.delete(onChange);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

function themeSnapshot() {
  return `${readPreference()}:${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const snapshot = React.useSyncExternalStore(subscribeTheme, themeSnapshot, () => "light:light");
  const [preference, resolved] = snapshot.split(":") as [ThemePreference, "light" | "dark"];

  const setPreference = React.useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem("fr-theme", p);
    } catch {}
    applyTheme(p);
    themeListeners.forEach((l) => l());
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          {children}
          <Toaster
            theme={resolved}
            position="bottom-right"
            offset={20}
            mobileOffset={{ bottom: "calc(92px + env(safe-area-inset-bottom))" }}
            gap={10}
            toastOptions={{
              classNames: {
                toast:
                  "!rounded-2xl !border !border-line !bg-surface-2 !text-fg !shadow-lg !font-sans !gap-3 !py-3.5",
                title: "!text-[13.5px] !font-semibold",
                description: "!text-[12.5px] !text-fg-muted",
                actionButton: "!bg-brand !text-white !rounded-lg !font-medium",
              },
            }}
          />
        </TooltipProvider>
      </MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <Providers>");
  return ctx;
}
