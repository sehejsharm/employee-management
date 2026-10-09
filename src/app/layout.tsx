import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/app/providers";
import { Splash } from "@/components/app/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Focus Realm Workspace",
    template: "%s · Focus Realm",
  },
  description: "Focus Realm's internal workspace — tasks, deadlines, people and the organisation, in one place.",
  applicationName: "Focus Realm Workspace",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Focus Realm", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#060a13" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs before first paint: applies the saved theme (no light/dark flash),
 * records the browser's time zone so deadlines render in local time, and
 * skips the splash screen if it has already played this session.
 */
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('fr-theme')||'light';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark');}catch(e){}try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;var c='fr_tz='+encodeURIComponent(z);if(z&&document.cookie.indexOf(c)<0){document.cookie=c+';path=/;max-age=31536000;samesite=lax';}}catch(e){}try{if(sessionStorage.getItem('fr-splash')){d.classList.add('fr-splash-seen');}else{sessionStorage.setItem('fr-splash','1');}}catch(e){d.classList.add('fr-splash-seen');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh">
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
