import { AuthShowcase } from "@/components/app/auth-showcase";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthShowcase />
      <main className="relative flex min-h-dvh flex-col bg-bg lg:bg-surface">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[var(--glow)] lg:hidden" />
        {children}
        <footer className="relative px-6 pb-6 text-center text-xs text-fg-subtle sm:px-10 lg:text-left">
          © {new Date().getFullYear()} Focus Realm · Internal workspace — authorised personnel only
        </footer>
      </main>
    </div>
  );
}
