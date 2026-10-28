/**
 * A small, self-contained 403 page for /launch/hr and /launch/crm. The app
 * switcher never links here forbidden (it hides what a person cannot use), so
 * this is only ever seen if someone visits the launch URL directly. It is a
 * route handler, not a React page, so it is plain HTML with inline styles
 * rather than Tailwind classes — no build step runs over this string.
 */
export function forbiddenPage(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Focus Realm</title>
<style>
  :root { color-scheme: light dark; --bg:#f5f7fb; --surface:#ffffff; --line:#e3e8f0; --fg:#0a1426; --fg-muted:#4b5a72; --brand:#1a6ae0; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#060a13; --surface:#0c1320; --line:#1a2539; --fg:#e8eef8; --fg-muted:#98a6bd; --brand:#3b8ef5; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
    text-align: center;
  }
  .card { max-width: 420px; }
  .brand { margin: 0 0 14px; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand); }
  h1 { margin: 0 0 10px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  p { margin: 0 0 22px; font-size: 14.5px; line-height: 1.6; color: var(--fg-muted); }
  a {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 40px; padding: 0 18px; border-radius: 10px;
    background: var(--brand); color: #ffffff; text-decoration: none;
    font-size: 14px; font-weight: 500;
  }
</style>
</head>
<body>
  <div class="card">
    <p class="brand">Focus Realm</p>
    <h1>Not available</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/dashboard">Back to Workspace</a>
  </div>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
