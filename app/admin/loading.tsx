/**
 * Admin pages are dynamic and fetch through the backend client, which allows up
 * to 12s before timing out. Without this the browser sat on the previous screen
 * with no feedback for the whole wait. The skeleton mirrors the real admin shell
 * so the sidebar and topbar do not appear to vanish mid-navigation.
 */
export default function AdminLoading() {
  return (
    <section className="admin-page admin-skeleton" aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading admin data
      </p>
      <aside className="admin-sidebar admin-skeleton-sidebar">
        <span className="admin-skeleton-brand" />
        <div className="admin-skeleton-nav">
          {Array.from({ length: 8 }).map((_item, index) => (
            <span key={index} />
          ))}
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar admin-skeleton-topbar">
          <div className="admin-skeleton-heading">
            <span />
            <strong />
          </div>
        </header>
        <div className="admin-content admin-skeleton-content">
          <div className="admin-skeleton-cards">
            {Array.from({ length: 3 }).map((_item, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="admin-skeleton-table">
            {Array.from({ length: 6 }).map((_item, index) => (
              <span key={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
