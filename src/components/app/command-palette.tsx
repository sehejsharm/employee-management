"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { CornerDownLeft, LogOut, MoonStar, Plus, Search, SunMedium } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { logout } from "@/app/(auth)/actions";
import { STATUS_META } from "@/components/tasks/meta";
import type { NavItem } from "./nav";
import { useTheme } from "./providers";

interface SearchResult {
  tasks: { id: string; number: number; title: string; status: keyof typeof STATUS_META }[];
  people: { id: string; firstName: string; lastName: string; title: string | null; avatarHue: number; employeeCode: string }[];
}

const PaletteContext = React.createContext<{ open: () => void } | null>(null);

export function usePalette() {
  return React.useContext(PaletteContext) ?? { open: () => {} };
}

export function CommandPalette({ nav, canCreate, children }: { nav: NavItem[]; canCreate: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const { resolved, setPreference } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult>({ tasks: [], people: [] });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closing clears the search, so the palette always opens fresh.
  const changeOpen = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults({ tasks: [], people: [] });
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults(await res.json());
      } catch {}
      setLoading(false);
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [query]);

  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  const shown = query.trim() ? results : { tasks: [], people: [] };

  const itemClass =
    "flex h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[13.5px] text-fg outline-none data-[selected=true]:bg-surface-hover [&_svg]:size-4 [&_svg]:text-fg-subtle";

  return (
    <PaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={changeOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[3px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
          <D.Content className="fixed left-1/2 top-[12dvh] z-50 w-[calc(100vw-1.5rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-lg outline-none data-[state=open]:animate-[pop-in_200ms_cubic-bezier(0.16,1,0.3,1)]">
            <D.Title className="sr-only">Command palette</D.Title>
            <D.Description className="sr-only">Search tasks and people, or jump anywhere.</D.Description>
            <Command shouldFilter={false} loop className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-line px-4">
                <Search className="size-[18px] shrink-0 text-fg-subtle" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search tasks, people, or jump to…"
                  className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
                />
                {loading && query.trim() && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />}
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="max-h-[min(440px,60dvh)] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-10 text-center text-[13px] text-fg-muted">
                  {query ? "No matches." : "Start typing to search."}
                </Command.Empty>

                {shown.tasks.length > 0 && (
                  <Command.Group heading="Tasks" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                    {shown.tasks.map((t) => {
                      const meta = STATUS_META[t.status];
                      return (
                        <Command.Item key={t.id} value={`task-${t.id}`} onSelect={() => go(`/tasks/${t.id}`)} className={itemClass}>
                          <meta.icon className={meta.iconClass} />
                          <span className="font-mono text-xs text-fg-subtle">T-{t.number}</span>
                          <span className="truncate">{t.title}</span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {shown.people.length > 0 && (
                  <Command.Group heading="People" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                    {shown.people.map((p) => (
                      <Command.Item key={p.id} value={`person-${p.id}`} onSelect={() => go(`/people/${p.id}`)} className={itemClass}>
                        <Avatar person={p} size="sm" />
                        <span className="truncate">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="truncate text-xs text-fg-subtle">{p.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {!query && (
                  <>
                    <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                      {canCreate && (
                        <Command.Item value="new-task" onSelect={() => go("/tasks/new")} className={itemClass}>
                          <Plus /> Create a task
                        </Command.Item>
                      )}
                      <Command.Item
                        value="theme"
                        onSelect={() => {
                          setPreference(resolved === "dark" ? "light" : "dark");
                          changeOpen(false);
                        }}
                        className={itemClass}
                      >
                        {resolved === "dark" ? <SunMedium /> : <MoonStar />} Switch to {resolved === "dark" ? "light" : "dark"} mode
                      </Command.Item>
                      <Command.Item value="logout" onSelect={() => logout()} className={itemClass}>
                        <LogOut /> Sign out
                      </Command.Item>
                    </Command.Group>
                    <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                      {nav.map((item) => (
                        <Command.Item key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)} className={itemClass}>
                          <item.icon /> {item.label}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}
              </Command.List>
              <div className="flex items-center justify-between border-t border-line bg-surface-sunken/60 px-4 py-2.5 text-[11.5px] text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> to navigate
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>
                    <CornerDownLeft className="size-3" />
                  </Kbd>{" "}
                  to open
                </span>
              </div>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </PaletteContext.Provider>
  );
}
