import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import type { PublicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  return (
    <AdminLayout
      title="Registered Customers"
      subtitle="Review customer accounts and order counts."
      actions={
        <Link className="secondary-btn" href="/admin">
          Dashboard
        </Link>
      }
    >
      <form action="/admin/customers" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search name, email, phone..." />
        <button type="submit">Search</button>
      </form>

      {/* The page frame and the search box paint immediately; only the table waits on
          the backend. Awaiting the list up here blocked the whole screen behind it. */}
      <AdminSectionErrorBoundary message="The customer list could not be loaded. This is a connection problem, not an empty list - the accounts are safe. Reload to try again.">
        <Suspense fallback={<CustomerTableSkeleton />}>
          <CustomerTable q={params?.q} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function CustomerTable({ q }: { q?: string }) {
  const customers = await getCustomers(q);

  return (
    <div className="admin-table">
      <CustomerHeading />
      {customers.map((customer) => (
        <div className="admin-table-row customer-row" key={customer.id}>
          <strong>{customer.name}</strong>
          <span>{customer.email}</span>
          <span>{customer.phone ?? "-"}</span>
          <span>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-KE") : "-"}</span>
          <span>
            {(customer.orders ?? 0) > 0 ? (
              <Link className="table-link" href={`/admin/orders?customerId=${encodeURIComponent(customer.id)}`}>
                {customer.orders} orders
              </Link>
            ) : "0"}
          </span>
        </div>
      ))}
      {!customers.length ? <p className="empty-state">No registered customers yet.</p> : null}
    </div>
  );
}

function CustomerHeading() {
  return (
    <div className="admin-table-row customer-heading">
      <span>Name</span>
      <span>Email</span>
      <span>Phone</span>
      <span>Joined</span>
      <span>Orders</span>
    </div>
  );
}

/** The real heading with placeholder rows, so the table does not jump when it lands. */
function CustomerTableSkeleton() {
  return (
    <div className="admin-table" aria-busy="true">
      <CustomerHeading />
      {[0, 1, 2, 3, 4].map((row) => (
        <div className="admin-table-row customer-row admin-row-skeleton" key={row}>
          <span /><span /><span /><span /><span />
        </div>
      ))}
    </div>
  );
}

async function getCustomers(q?: string) {
  const term = q?.trim();
  // Deliberately not caught: an empty table and a dead backend must not look the same.
  // The boundary above says which it is.
  return apiFetch<(PublicUser & { orders?: number })[]>(`/admin/customers${toQueryString({ q: term })}`);
}
