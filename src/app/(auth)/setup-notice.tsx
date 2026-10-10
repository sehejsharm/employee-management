import Link from "next/link";
import { ArrowRight, Database, DatabaseZap, KeyRound, RefreshCw, ServerCog } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { FadeIn } from "@/components/motion";
import type { WorkspaceStatus } from "@/lib/setup";

const COPY: Record<Exclude<WorkspaceStatus, "ready">, { icon: typeof Database; title: string; body: string; steps: string[] }> = {
  "no-database": {
    icon: Database,
    title: "This workspace isn't connected to a database yet",
    body: "Nothing is broken — the app is deployed, it just has nowhere to keep its data. A founder finishes setup in Vercel:",
    steps: [
      "Open the project in Vercel → Storage → Create Database → Neon or Supabase. Choose the Mumbai region and connect it to Production.",
      "Deployments → the latest one → ⋯ → Redeploy. The tables are created automatically during the deploy.",
      "Come back to this page.",
    ],
  },
  unreachable: {
    icon: DatabaseZap,
    title: "The workspace can't reach its database right now",
    body: "This is usually temporary. Give it a minute and refresh.",
    steps: [
      "Free Supabase projects pause after a week without use — restore it from the Supabase dashboard.",
      "Founders: the exact error is in Vercel → the project → Logs.",
    ],
  },
  "not-migrated": {
    icon: ServerCog,
    title: "The database is connected but still empty",
    body: "Its tables are created by the deploy, so this deployment ran before the database was attached.",
    steps: ["In Vercel open Deployments → the latest one → ⋯ → Redeploy.", "Come back to this page once it finishes."],
  },
  "needs-founder": {
    icon: KeyRound,
    title: "Create the first founder account",
    body: "The workspace is ready, but no one can sign in until a founder account exists. Everyone else is added from the HR console or the People screen afterwards.",
    steps: [
      "In Vercel → Settings → Environment Variables add SETUP_TOKEN with a long random value — for example the output of openssl rand -hex 24 — then redeploy.",
      "Open /setup and enter that token. The page switches itself off as soon as the first founder exists.",
    ],
  },
};

/** What the sign-in page shows while a fresh deployment isn't usable yet. */
export function SetupNotice({ status, setupOpen }: { status: Exclude<WorkspaceStatus, "ready">; setupOpen: boolean }) {
  const c = COPY[status];
  const Icon = c.icon;
  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <FadeIn className="w-full max-w-[440px]">
        <div className="mb-9 flex items-center gap-3 lg:hidden">
          <BrandMark size={40} variant="tile" />
          <div className="leading-none">
            <div className="text-[16px] font-semibold tracking-tight">Focus Realm</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-fg-subtle">Workspace</div>
          </div>
        </div>

        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Icon className="size-5" />
        </span>
        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Setting up</p>
        <h2 className="mt-2 text-balance text-[26px] font-semibold tracking-[-0.025em] text-fg">{c.title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{c.body}</p>

        {status === "needs-founder" && setupOpen ? (
          <Link
            href="/setup"
            className="group mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-medium text-brand-fg shadow-brand transition hover:bg-brand-hover active:scale-[0.98]"
          >
            Set up the workspace <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <ol className="mt-7 space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            {c.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-[13.5px] leading-relaxed text-fg-muted">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-soft-fg tabular">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        <Link
          href="/login"
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition hover:text-brand"
        >
          <RefreshCw className="size-3.5" /> Check again
        </Link>
      </FadeIn>
    </div>
  );
}
