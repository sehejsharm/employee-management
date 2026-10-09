import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/env";
import { handleHrEvent } from "@/lib/hr/provision";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "@/lib/hr/signature";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * The HR console's door into the workspace. Every request must be signed with
 * the shared secret; unsigned or stale requests are rejected before the body
 * is even parsed. See docs/HR_CONSOLE_INTEGRATION.md.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  const verdict = verifySignature({
    secret: config.hrWebhookSecret(),
    rawBody: raw,
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });
  if (!verdict.ok) {
    const status = verdict.reason.startsWith("Integration is not configured") ? 503 : 401;
    return NextResponse.json({ ok: false, error: verdict.reason }, { status });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  const result = await handleHrEvent(body);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return NextResponse.json(
    { ok: true, service: "focus-realm-workspace", endpoint: "POST signed events here", docs: "docs/HR_CONSOLE_INTEGRATION.md" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
