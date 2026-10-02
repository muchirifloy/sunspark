import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { OrderTable } from "@/components/admin/order-table";
import type { OrderStatus, PaymentStatus, Order } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { canManageCatalog } from "@/lib/auth/roles";
import { apiFetch, toQueryString } from "@/lib/api/client";

export const dynamic = "force-dynamic";
const orderStatuses: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"];
const paymentStatuses: PaymentStatus[] = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; paymentStatus?: string; customerId?: string; notice?: string; error?: string; ref?: string; doc?: string }>;
}) {
  const admin = await requireAdmin();
  const canDelete = canManageCatalog(admin.role);
  const params = await searchParams;
  const feedback = orderFeedback(params?.notice, params?.error, params?.ref, params?.doc);

  return (
    <AdminLayout title="Orders" subtitle="Orders still being worked. Completed and cancelled ones move to Past Orders.">
      {feedback ? <p className={`admin-feedback ${feedback.ok ? "success" : "error"}`} role={feedback.ok ? "status" : "alert"}>{feedback.message}</p> : null}
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
          <ActiveOrders canDelete={canDelete} params={params} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

function orderFeedback(notice?: string, error?: string, reference?: string, revertedDocument?: string) {
  const name = reference ? `Order ${reference}` : "The order";
  if (error === "order-delete") return { ok: false, message: "The order could not be deleted. Nothing was changed -- reload and try again." };
  if (error === "order-missing") return { ok: false, message: "That order no longer exists. It may already have been deleted." };
  if (notice === "saved") return { ok: true, message: "Order saved." };

  if (notice === "order-deleted-restored") {
    const reverted = revertedDocument ? ` Invoice ${revertedDocument} is back in draft and can be corrected and finalized again.` : "";
    return { ok: true, message: `${name} was deleted and the stock it used is back in inventory.${reverted}` };
  }

  if (notice === "order-deleted-kept") {
    // The stock was not returned, so finalizing the reverted invoice a second
    // time would deduct the same goods twice. Said plainly rather than left for
    // the operator to work out.
    const reverted = revertedDocument
      ? ` Invoice ${revertedDocument} is back in draft -- finalizing it again would deduct this stock a second time, so delete it instead unless you are re-issuing the sale.`
      : "";
    return { ok: true, message: `${name} was deleted. Stock stays deducted because the order had already been dispatched.${reverted}` };
  }

  return null;
}

async function ActiveOrders({ canDelete, params }: { canDelete: boolean; params?: { q?: string; status?: string; paymentStatus?: string; customerId?: string } }) {
  const orders = await getOrders({
    paymentStatus: params?.paymentStatus,
    customerId: params?.customerId,
    q: params?.q,
    status: params?.status
  });

  return <OrderTable canDelete={canDelete} emptyMessage="No active orders. Completed ones are under Past Orders." orders={orders} />;
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
