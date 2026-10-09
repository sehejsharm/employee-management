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
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [preference, setPref] = React.useState<ThemePreference>("light");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  // The boot script already applied the class; sync React state to it after mount.
  React.useEffect(() => {
    const p = readPreference();
    setPref(p);
    setResolved(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  React.useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  function apply(p: ThemePreference) {
    const dark = p === "dark" || (p === "system" && systemDark());
    const root = document.documentElement;
    // Suppress transitions for the instant of the switch so nothing animates through odd colours.
    root.classList.add("theme-switching");
    root.classList.toggle("dark", dark);
    setResolved(dark ? "dark" : "light");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  }

  const setPreference = React.useCallback((p: ThemePreference) => {
    try {
      localStorage.setItem("fr-theme", p);
    } catch {}
    setPref(p);
    apply(p);
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
            mobileOffset={{ bottom: 84 }}
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
