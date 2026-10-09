import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: anyone without a session cookie is sent to the login page
 * before any page code runs. This only checks that a cookie exists — the real
 * check (valid, unexpired, active account) happens in the Data Access Layer
 * (src/lib/auth/current-user.ts) on every page and action.
 */
const SESSION_COOKIES = ["__Host-fr_session", "fr_session"];

const PUBLIC_PREFIXES = ["/login", "/api/integrations/", "/api/cron/", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|brand/|icon.svg|apple-icon|favicon.ico|robots.txt).*)"],
};
