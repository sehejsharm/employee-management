import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: anyone without a session cookie is sent to the login page
 * before any page code runs. This only checks that a cookie exists — the real
 * check (valid, unexpired, active account) happens in the Data Access Layer
 * (src/lib/auth/current-user.ts) on every page and action.
 */
const SESSION_COOKIES = ["__Host-fr_session", "fr_session"];

const PUBLIC_PREFIXES = ["/login", "/setup", "/privacy", "/terms"];

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
  matcher: ["/((?!api/|_next/static|_next/image|brand/|icons/|icon.svg|apple-icon|apple-touch-icon|manifest.webmanifest|favicon.ico|robots.txt).*)"],
};
