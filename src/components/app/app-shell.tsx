"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsUpDown, LogOut, MoreHorizontal, Plus, Search, Settings, Sun, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { logout } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { CommandPalette, usePalette } from "./command-palette";
import { DailyBriefing, OPEN_BRIEFING_EVENT } from "./daily-briefing";
import { NotificationBell, NotificationsProvider } from "./notification-bell";
import { IncomingCallWatcher } from "./incoming-call";
import { SECTION_LABEL, navItems, type NavItem, type ShellFlags, type ShellUser } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href;
}

export function AppShell({
  user,
  flags,
  unread,
  children,
}: {
  user: ShellUser;
  flags: ShellFlags;
  unread: number;
  children: React.ReactNode;
}) {
  const nav = React.useMemo(() => navItems(flags), [flags]);
  return (
    <NotificationsProvider initialUnread={unread}>
      <CommandPalette nav={nav} canCreate>
        <div className="relative min-h-dvh">
          <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] bg-[var(--glow)]" />
          <Sidebar nav={nav} user={user} />
          <div className="relative lg:pl-[260px]">
            <Topbar user={user} nav={nav} />
            <main className="safe-x mx-auto w-full max-w-[1400px] pb-28 pt-5 [--gutter:1rem] sm:[--gutter:1.5rem] lg:pb-16 lg:pt-8 lg:[--gutter:2.5rem]">
              {children}
            </main>
          </div>
          <MobileNav nav={nav} user={user} />
        </div>
        <DailyBriefing />
        <IncomingCallWatcher />
      </CommandPalette>
    </NotificationsProvider>
  );
}

function Sidebar({ nav, user }: { nav: NavItem[]; user: ShellUser }) {
  const path = usePathname();
  const sections = (["work", "company", "leadership"] as const)
    .map((s) => ({ section: s, items: nav.filter((n) => n.section === s) }))
    .filter((s) => s.items.length);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-line bg-surface/80 backdrop-blur-xl lg:flex">
      <Link href="/dashboard" className="group flex h-16 items-center gap-3 px-5">
        <motion.span whileHover={{ rotate: -6, scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
          <BrandMark size={34} variant="tile" />
        </motion.span>
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">Focus Realm</span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-fg-subtle">Workspace</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-3">
        {sections.map(({ section, items }) => (
          <div key={section}>
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              {SECTION_LABEL[section]}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(item, path);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors",
                        active ? "text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-[10px] border border-line bg-surface shadow-xs"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      {active && (
                        <motion.span
                          layoutId="sidebar-active-bar"
                          className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <item.icon className={cn("relative size-[17px]", active ? "text-brand" : "text-fg-subtle group-hover:text-fg-muted")} />
                      <span className="relative">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <UserMenu user={user} align="start" side="top">
          <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-hover">
            <Avatar person={user} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-xs text-fg-subtle">
                {user.roleLabel} · {user.employeeCode}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
          </button>
        </UserMenu>
      </div>
    </aside>
  );
}

function UserMenu({
  user,
  children,
  align = "end",
  side = "bottom",
}: {
  user: ShellUser;
  children: React.ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-[13px] font-medium text-fg">
            {user.firstName} {user.lastName}
          </span>
          <span className="block truncate text-xs font-normal text-fg-subtle">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(OPEN_BRIEFING_EVENT))}>
          <Sun /> Today&apos;s plan
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/people/${user.id}`}>
            <UserRound /> My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={() => logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Topbar({ user, nav }: { user: ShellUser; nav: NavItem[] }) {
  const palette = usePalette();
  const path = usePathname();
  const current = nav.find((n) => isActive(n, path));
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 glass">
      <div className="safe-x mx-auto flex h-16 max-w-[1400px] items-center gap-3 [--gutter:1rem] sm:[--gutter:1.5rem] lg:[--gutter:2.5rem]">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
          <BrandMark size={30} variant="tile" className="shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight">{current?.label ?? "Focus Realm"}</span>
        </Link>

        <button
          onClick={palette.open}
          className="hidden h-9 w-full max-w-sm items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-fg-subtle shadow-xs transition hover:border-line-strong hover:text-fg-muted md:flex lg:max-w-md"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={palette.open} aria-label="Search">
            <Search />
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/tasks/new">
              <Plus /> New task
            </Link>
          </Button>
          <span className="hidden min-[360px]:contents">
            <ThemeToggle />
          </span>
          <NotificationBell />
          <UserMenu user={user}>
            <button className="flex h-10 w-10 items-center justify-center rounded-full lg:hidden" aria-label="Account menu">
              <Avatar person={user} size="sm" />
            </button>
          </UserMenu>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ nav, user }: { nav: NavItem[]; user: ShellUser }) {
  const path = usePathname();
  const [more, setMore] = React.useState(false);
  const primary = ["/dashboard", "/tasks", "/org", "/notifications"];
  const tabs = primary.map((href) => nav.find((n) => n.href === href)!).filter(Boolean);
  const rest = nav.filter((n) => !primary.includes(n.href));

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line glass lg:hidden">
        <div className="safe-x relative mx-auto grid h-[68px] max-w-lg grid-cols-5 items-center [--gutter:0.5rem]">
          {tabs.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item, path)} />
          ))}
          <div className="flex justify-center">
            <Link
              href="/tasks/new"
              aria-label="New task"
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand ring-4 ring-bg transition active:scale-95"
            >
              <Plus className="size-6" />
            </Link>
          </div>
          {tabs.slice(2, 3).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item, path)} />
          ))}
          <button
            onClick={() => setMore(true)}
            className={cn(
              "flex flex-col items-center gap-1 text-[10.5px] font-medium",
              rest.some((n) => isActive(n, path)) ? "text-brand" : "text-fg-subtle",
            )}
          >
            <MoreHorizontal className="size-[22px]" />
            More
          </button>
        </div>
      </nav>

      <Dialog open={more} onOpenChange={setMore}>
        <SheetContent title="Menu" description={`${user.firstName} ${user.lastName} · ${user.employeeCode}`}>
          <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
            {[...tabs.slice(3), ...rest].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMore(false)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-line px-2 py-4 text-center text-[12.5px] font-medium leading-tight transition active:scale-[0.97]",
                  isActive(item, path) ? "border-brand/30 bg-brand-soft text-brand-soft-fg" : "bg-surface text-fg-muted",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </div>
          <Button
            variant="soft"
            className="mt-4 w-full"
            onClick={() => {
              setMore(false);
              window.dispatchEvent(new Event(OPEN_BRIEFING_EVENT));
            }}
          >
            <Sun /> Today&apos;s plan
          </Button>
          <form action={logout} className="mt-2">
            <Button variant="secondary" className="w-full" type="submit">
              <LogOut /> Sign out
            </Button>
          </form>
        </SheetContent>
      </Dialog>
    </>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className={cn("relative flex flex-col items-center gap-1 text-[10.5px] font-medium", active ? "text-brand" : "text-fg-subtle")}>
      <AnimatePresence>
        {active && (
          <motion.span
            layoutId="mobile-tab"
            className="absolute -top-2.5 h-[3px] w-8 rounded-full bg-brand"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </AnimatePresence>
      <item.icon className="size-[22px]" />
      {item.label}
    </Link>
  );
}
