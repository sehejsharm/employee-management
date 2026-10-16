import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  HardDrive,
  LayoutDashboard,
  Megaphone,
  Archive,
  Network,
  Settings,
  ShieldCheck,
  Telescope,
  Users,
} from "lucide-react";

export interface ShellUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  title: string | null;
  roleLabel: string;
  avatarHue: number;
}

export interface ShellFlags {
  isLeader: boolean;
  isFounder: boolean;
  canAssign: boolean;
  canAdminister: boolean;
  canManagePeople: boolean;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
  section: "work" | "company" | "leadership" | "account";
}

export function navItems(flags: ShellFlags): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard, section: "work" },
    { href: "/tasks", label: "Tasks", icon: CheckSquare, section: "work", match: (p) => p.startsWith("/tasks") },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, section: "work" },
    { href: "/notifications", label: "Inbox", icon: Bell, section: "work" },
    { href: "/drive", label: "My drive", icon: HardDrive, section: "work" },
    { href: "/org", label: "Org chart", icon: Network, section: "company" },
    { href: "/people", label: "People", icon: Users, section: "company", match: (p) => p.startsWith("/people") },
    { href: "/announcements", label: "Announcements", icon: Megaphone, section: "company" },
    { href: "/clearance", label: "Clearance", icon: ShieldCheck, section: "company" },
  ];
  // Founders' work is founders-only, so the leadership board is too.
  if (flags.isFounder) {
    items.push({ href: "/leadership", label: "Leadership", icon: Telescope, section: "leadership" });
    items.push({ href: "/leadership/archive", label: "Work archive", icon: Archive, section: "leadership" });
  }
  if (flags.canAdminister) {
    items.push({ href: "/admin", label: "Workspace admin", icon: Building2, section: "leadership", match: (p) => p.startsWith("/admin") });
  }
  items.push({ href: "/settings", label: "Settings", icon: Settings, section: "account" });
  return items;
}

export const SECTION_LABEL: Record<NavItem["section"], string> = {
  work: "Work",
  company: "Company",
  leadership: "Leadership",
  account: "Account",
};
