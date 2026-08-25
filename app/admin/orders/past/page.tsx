import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { OrderTable } from "@/components/admin/order-table";
import type { Order, PaymentStatus } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";

export const dynamic = "force-dynamic";
const paymentStatuses: PaymentStatus[] = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export default async function PastOrdersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; paymentStatus?: string; customerId?: string }>;
}) {
  await requireAdmin("/admin/orders/past");
  const params = await searchParams;

  return (
    <AdminLayout title="Past Orders" subtitle="Completed and cancelled orders, kept out of the working list.">
      <form action="/admin/orders/past" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search order number, customer name, email, phone, location..." />
        <select name="paymentStatus" defaultValue={params?.paymentStatus ?? ""}>
          <option value="">All payment status</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button type="submit">Filter</button>
        <Link className="filter-reset" href="/admin/orders/past">All past orders</Link>
        <Link className="filter-reset" href="/admin/orders">Back to active</Link>
      </form>
      <AdminSectionErrorBoundary message="The past order list could not be loaded. This is a connection problem, not an empty list -- your orders are safe. Reload to try again.">
        <Suspense fallback={<p className="empty-state">Loading past orders...</p>}>
          <PastOrders params={params} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function PastOrders({ params }: { params?: { q?: string; paymentStatus?: string; customerId?: string } }) {
  const terms = params?.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  const orders = await apiFetch<Order[]>(`/admin/orders${toQueryString({
    q: terms.join(" "),
    customerId: params?.customerId,
    group: "past",
    paymentStatus: paymentStatuses.includes(params?.paymentStatus as PaymentStatus) ? params?.paymentStatus : undefined
  })}`);

  return <OrderTable emptyMessage="No completed or cancelled orders yet." orders={orders} />;
}
