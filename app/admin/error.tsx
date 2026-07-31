"use client";

import Link from "next/link";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message?.includes("Admin API")
    ? error.message
    : "The admin data connection did not complete. The backend may be restarting or the network may be weak.";

  return (
    <main className="admin-error-page">
      <section className="admin-error-card">
        <span className="eyebrow">Admin connection</span>
        <h1>Admin data is reconnecting.</h1>
        <p>{message}</p>
        <div className="admin-error-actions">
          <button className="primary-btn" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="secondary-btn" href="/admin">
            Back to dashboard
          </Link>
          <Link className="secondary-btn" href="/admin/login">
            Admin login
          </Link>
        </div>
      </section>
    </main>
  );
}
