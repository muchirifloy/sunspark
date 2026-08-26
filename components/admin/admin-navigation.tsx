"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export type AdminNavItem = {
  group: string;
  href: string;
  icon: string;
  label: string;
  ownerOnly?: boolean;
  showsOrderCount?: boolean;
};

/**
 * Shuts the phone menu.
 *
 * The menu is a <details>, so on a full page load it reopens closed by itself. Client
 * navigation does not reload the document, so without this the panel stays open on top
 * of the page the operator just asked for.
 */
function closeMobileMenu() {
  document.querySelector<HTMLDetailsElement>(".admin-mobile-menu[open]")?.removeAttribute("open");
}

export function AdminNavigation({
  links,
  pendingOrderCount,
}: {
  links: AdminNavItem[];
  pendingOrderCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeHref = getActiveHref(links, pathname, searchParams);
  let currentGroup = "";

  // Covers arriving anywhere the tapped link did not cause directly - the back button,
  // a redirect after a form action - which a click handler alone would miss.
  useEffect(closeMobileMenu, [pathname, searchParams]);

  // Escape is what a keyboard user reaches for, and phones with a keyboard attached
  // otherwise have no way to dismiss the panel without picking something from it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMobileMenu();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return links.map((link) => {
    const showGroup = link.group !== currentGroup;
    currentGroup = link.group;

    return (
      <div className="admin-nav-entry" key={link.href}>
        {showGroup ? <span className="admin-nav-group">{link.group}</span> : null}
        <AdminNavLink active={link.href === activeHref} link={link} pendingOrderCount={pendingOrderCount} />
      </div>
    );
  });
}

function getActiveHref(links: AdminNavItem[], pathname: string, searchParams: URLSearchParams) {
  let bestMatch: { href: string; score: number } | null = null;

  for (const link of links) {
    const [linkPath, query = ""] = link.href.split("?");
    const pathMatches = linkPath === "/admin"
      ? pathname === linkPath
      : pathname === linkPath || pathname.startsWith(`${linkPath}/`);
    if (!pathMatches) continue;

    const requiredQuery = new URLSearchParams(query);
    const queryMatches = Array.from(requiredQuery.entries()).every(([key, value]) => searchParams.get(key) === value);
    if (!queryMatches) continue;

    const score = linkPath.length + (query ? 100 : 0);
    if (!bestMatch || score > bestMatch.score) bestMatch = { href: link.href, score };
  }

  return bestMatch?.href ?? "";
}

function AdminNavLink({
  active,
  link,
  pendingOrderCount,
}: {
  active: boolean;
  link: AdminNavItem;
  pendingOrderCount: number;
}) {
  const showBadge = link.showsOrderCount && pendingOrderCount > 0;
  const className = [link.showsOrderCount ? "admin-orders-link" : "", active ? "active" : ""].filter(Boolean).join(" ");

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={className || undefined}
      href={link.href}
      // Closed on the tap rather than on arrival, so the panel does not sit there while
      // the next page loads - and so re-picking the current page still dismisses it.
      onClick={closeMobileMenu}
    >
      <span className="admin-nav-label"><AdminNavIcon name={link.icon} />{link.label}</span>
      {showBadge ? (
        <span className="admin-order-notification" title={`${pendingOrderCount} pending ${pendingOrderCount === 1 ? "order" : "orders"}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          <strong aria-label={`${pendingOrderCount} pending ${pendingOrderCount === 1 ? "order" : "orders"}`}>{pendingOrderCount > 99 ? "99+" : pendingOrderCount}</strong>
        </span>
      ) : null}
    </Link>
  );
}

function AdminNavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>,
    orders: <><path d="M5 7h14l-1 13H6zM8 7a4 4 0 0 1 8 0" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M16 14c3.3 0 5 2 5 5" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
    documents: <><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" /></>,
    sale: <><path d="M4 5h16l-2 10H7zM7 15l-2 4h14M9 9h6" /></>,
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" /></>,
    categories: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    stock: <><path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8M8 16h5" /></>,
    campaigns: <><path d="m4 13 12-5v11L4 14zM16 11h2a2 2 0 0 1 0 4h-2M7 15l1 5h4l-2-6" /></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    sms: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2.3.7v3l2.3.7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" /></>,
  };

  return <svg aria-hidden="true" className="admin-nav-icon" viewBox="0 0 24 24">{paths[name] ?? paths.dashboard}</svg>;
}
