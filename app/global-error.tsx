"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#ffffff", color: "#1d2433", fontFamily: "Arial, sans-serif" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "24px" }}>
          <section style={{ maxWidth: "460px", textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", color: "#15803d", fontSize: "13px", fontWeight: 700, textTransform: "uppercase" }}>Connection delay</p>
            <h1 style={{ margin: "0 0 10px", color: "#0e52a4", fontSize: "32px" }}>The connection is refreshing.</h1>
            <p style={{ margin: "0 0 20px", color: "#657084", lineHeight: 1.55 }}>A request took longer than expected. Please retry once the connection settles.</p>
            <button
              onClick={reset}
              style={{ border: 0, borderRadius: "24px", background: "#f36f21", color: "#fff", cursor: "pointer", fontWeight: 700, minHeight: "44px", padding: "0 22px" }}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
