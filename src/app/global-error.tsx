"use client";

/** Last-resort boundary if the root layout itself fails. Self-contained: no app styles are guaranteed here. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f5f7fb",
          color: "#0a1426",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "#1a6ae0", fontWeight: 600 }}>
            Focus Realm Workspace
          </div>
          <h1 style={{ fontSize: 26, margin: "12px 0 8px", letterSpacing: "-0.02em" }}>We hit an unexpected problem</h1>
          <p style={{ color: "#4b5a72", lineHeight: 1.6, margin: 0 }}>
            Please try again. If it keeps happening, let a founder know{error.digest ? ` and mention reference ${error.digest}` : ""}.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 24,
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: 0,
              background: "#1a6ae0",
              color: "white",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
