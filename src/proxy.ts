import { NextResponse, type NextRequest } from "next/server";
import { config as appConfig } from "@/lib/env";

/**
 * Optimistic gate: anyone without a session cookie is sent to the login page
 * before any page code runs. This only checks that a cookie exists — the real
 * check (valid, unexpired, active account) happens in the Data Access Layer
 * (src/lib/auth/current-user.ts) on every page and action.
 */
const SESSION_COOKIES = ["__Host-fr_session", "fr_session"];

const PUBLIC_PREFIXES = ["/login", "/setup", "/privacy", "/terms"];

/** The header the HR console and CRM trust in place of their own login — see docs/one-website. */
const HUB_HEADER = "x-focusrealm-hub";

/**
 * The single Focus Realm website: the HR console (sehejsharm/focusrealmhr) is
 * served here under /hr, /hr-static and /api/onboarding, and the Sales CRM
 * (sehejsharm/crm-focusrealm) under /crm — each its own app, deployment and
 * storage, reverse-proxied by path. Runs before the session gate and before
 * any CSP is applied: these paths are public here (candidates open
 * /hr/<token> invitation links with no Workspace account, and the HR console
 * and CRM check access themselves), and must not carry the Workspace's CSP or
 * nonce, which would block the other app's own scripts.
 *
 * With FOCUS_REALM_HUB_SECRET unset, none of this runs — nothing changes.
 * With HR_CONSOLE_ORIGIN (or CRM_ORIGIN) unset, that one app's routing is
 * simply not there; the other can still be configured independently.
 */
function routeToHub(request: NextRequest): NextResponse | null {
  const secret = appConfig.hubSecret();
  if (!secret) return null;
  const { pathname, search } = request.nextUrl;

  const hrOrigin = appConfig.hrConsoleOrigin();
  if (hrOrigin && (pathname === "/hr" || pathname.startsWith("/hr/") || pathname.startsWith("/hr-static/") || pathname.startsWith("/api/onboarding/"))) {
    return rewriteToHub(request, `${hrOrigin}${pathname}${search}`, secret);
  }

  const crmOrigin = appConfig.crmOrigin();
  if (crmOrigin && (pathname === "/crm" || pathname.startsWith("/crm/"))) {
    // The CRM's own address knows nothing about the /crm prefix — strip it.
    const rest = pathname.slice("/crm".length) || "/";
    return rewriteToHub(request, `${crmOrigin}${rest}${search}`, secret);
  }

  return null;
}

function rewriteToHub(request: NextRequest, destination: string, secret: string) {
  const headers = new Headers(request.headers);
  headers.set(HUB_HEADER, secret);
  return NextResponse.rewrite(destination, { request: { headers } });
}

/**
 * Content-Security-Policy with a fresh nonce per request: only scripts Next.js
 * renders (and the boot script in the root layout) can run, so an injected
 * <script> or inline handler is refused by the browser. Styles stay inline-able
 * because animations and React style props use style attributes.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // The service worker that shows phone notifications (public/sw.js).
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Passes the request on, carrying the CSP nonce to the page and the policy to the browser. */
function next(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function proxy(request: NextRequest) {
  const hubResponse = routeToHub(request);
  if (hubResponse) return hubResponse;

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return next(request);

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return next(request);

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip static assets, Next internals and /api: every API route authenticates
  // itself (or is public by design: health, cron, HR webhook), and skipping
  // them halves the function invocations that notification polling costs on Vercel.
  // /api/onboarding/* is the exception: it's the HR console's own API, hub-routed
  // above, so it must reach proxy() rather than being excluded with the rest of /api.
  matcher: ["/((?!api/(?!onboarding/)|_next/static|_next/image|brand/|icons/|icon.svg|apple-icon|apple-touch-icon|manifest.webmanifest|sw.js|favicon.ico|robots.txt).*)"],
};
