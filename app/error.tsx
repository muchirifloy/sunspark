"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="section">
      <div className="container friendly-state">
        <p className="eyebrow">Connection delay</p>
        <h1>This section is refreshing.</h1>
        <p>A network request took longer than expected. Retry this section, or open the store while the connection settles.</p>
        <div className="hero-actions">
          <button className="primary-btn" onClick={reset} type="button">Try again</button>
          <Link className="secondary-btn" href="/store#top">Open store</Link>
        </div>
      </div>
    </section>
  );
}
