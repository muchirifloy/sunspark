import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminLogoutAction } from "@/app/admin/logout-action";
import { AdminBackButton } from "@/components/admin/admin-back-button";
import { AdminNavigation, type AdminNavItem } from "@/components/admin/admin-navigation";
import { getPendingOrderCount } from "@/lib/admin/queries";
import { getSession } from "@/lib/auth/session";
import { canManageCatalog } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types";

// Only the dashboard uses Inter, so it loads here instead of on every
// storefront page through the root layout.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const adminLinks: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", group: "Overview", icon: "dashboard" },
  { href: "/admin/orders", label: "Orders", group: "Sales", icon: "orders", showsOrderCount: true },
  { href: "/admin/orders/past", label: "Past Orders", group: "Sales", icon: "documents" },
  { href: "/admin/customers", label: "Customers", group: "Sales", icon: "customers" },
  { href: "/admin/payments", label: "Payments", group: "Sales", icon: "payments" },
  { href: "/admin/invoices", label: "Invoices & Quotes", group: "Sales", icon: "documents" },
  { href: "/admin/walk-in-sale", label: "Walk-in Sale", group: "Sales", icon: "sale" },
  { href: "/admin/products", label: "Products", group: "Catalogue", icon: "products" },
  { href: "/admin/categories", label: "Categories", group: "Catalogue", icon: "categories", ownerOnly: true },
  { href: "/admin/products/new", label: "Add Product", group: "Catalogue", icon: "add", ownerOnly: true },
  { href: "/admin/products?status=low", label: "Low Stock", group: "Inventory", icon: "stock" },
  { href: "/admin/campaigns", label: "Campaigns", group: "Marketing", icon: "campaigns", ownerOnly: true },
  { href: "/admin/sms", label: "Bulk SMS", group: "Marketing", icon: "sms" },
  { href: "/admin/reports", label: "Sales Reports", group: "Reports", icon: "reports" },
  { href: "/admin/reports?view=stock", label: "Stock Reports", group: "Reports", icon: "stock" },
  { href: "/admin/reports?view=customers", label: "Customer Reports", group: "Reports", icon: "customers" },
  { href: "/admin/settings", label: "Store Settings", group: "Settings", icon: "settings", ownerOnly: true }
];

export async function AdminLayout({
  actions,
  children,
  pendingOrderCountOverride,
  roleOverride,
  subtitle,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  pendingOrderCountOverride?: number;
  roleOverride?: UserRole;
  subtitle?: string;
  title: string;
}) {
  const [session, pendingOrderCount] = await Promise.all([
    getSession(),
    pendingOrderCountOverride === undefined ? getPendingOrderCount() : Promise.resolve(pendingOrderCountOverride),
  ]);
  const links = adminLinks.filter((link) => !link.ownerOnly || canManageCatalog(roleOverride ?? session?.role));

  return (
    <section className={`admin-page ${inter.variable}`}>
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">
          <span>Sunspark</span>
          <small>Admin</small>
        </Link>
        {/* The menu is only a toggle. The panel it controls is a sibling rather
            than a child so one nav can serve both layouts: on desktop the panel
            sits in the sidebar flow, on mobile CSS turns it into a dropdown
            revealed by `[open] ~ .admin-nav-panel`. */}
        <details className="admin-mobile-menu">
          <summary aria-label="Open admin menu">
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </summary>
        </details>
        <div className="admin-nav-panel">
          <nav aria-label="Admin navigation">
            <AdminNavigation links={links} pendingOrderCount={pendingOrderCount} />
          </nav>
          <form action={adminLogoutAction} className="admin-logout">
            <button type="submit">Log out</button>
          </form>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <AdminBackButton />
            <div>
              {/* No "Admin" eyebrow: the sidebar says it on every page already, and it
                  cost a line of height at the top of all of them. */}
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </section>
  );
}
