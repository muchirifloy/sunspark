import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { OrderTable } from "@/components/admin/order-table";
import type { OrderStatus, PaymentStatus, Order } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";

export const dynamic = "force-dynamic";
const orderStatuses: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"];
const paymentStatuses: PaymentStatus[] = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; paymentStatus?: string; customerId?: string; notice?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  return (
    <AdminLayout title="Orders" subtitle="Orders still being worked. Completed and cancelled ones move to Past Orders.">
      {params?.notice === "saved" ? <p className="admin-feedback success" role="status">Order saved.</p> : null}
      <form action="/admin/orders" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search order number, customer name, email, phone, location..." />
        <select name="status" defaultValue={params?.status ?? ""}>
          <option value="">Active order status</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="READY">Ready</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select name="paymentStatus" defaultValue={params?.paymentStatus ?? ""}>
          <option value="">All payment status</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button type="submit">Filter</button>
        <Link className="filter-reset" href="/admin/orders">Active orders</Link>
        <Link className="filter-reset" href="/admin/orders/past">Past orders</Link>
      </form>
      <AdminSectionErrorBoundary message="The order list could not be loaded. This is a connection problem, not an empty list -- your orders are safe. Reload to try again.">
        <Suspense fallback={<p className="empty-state">Loading orders...</p>}>
          <ActiveOrders params={params} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function ActiveOrders({ params }: { params?: { q?: string; status?: string; paymentStatus?: string; customerId?: string } }) {
  const orders = await getOrders({
    paymentStatus: params?.paymentStatus,
    customerId: params?.customerId,
    q: params?.q,
    status: params?.status
  });

  return <OrderTable emptyMessage="No active orders. Completed ones are under Past Orders." orders={orders} />;
}

// `group=active` hides completed and cancelled orders unless an explicit status
// filter asks for them, so the working list stays short.
// Not caught: an empty list and a dead backend must not look the same.
async function getOrders(input: { q?: string; status?: string; paymentStatus?: string; customerId?: string }) {
  const terms = input.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  return apiFetch<Order[]>(`/admin/orders${toQueryString({
    q: terms.join(" "),
    customerId: input.customerId,
    group: "active",
    status: orderStatuses.includes(input.status as OrderStatus) ? input.status : undefined,
    paymentStatus: paymentStatuses.includes(input.paymentStatus as PaymentStatus) ? input.paymentStatus : undefined
  })}`);
}
