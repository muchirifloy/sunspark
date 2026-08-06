import Link from "next/link";
import { AdminLayout } from "@/components/admin/admin-layout";
import { OrderStatusControls } from "@/components/admin/order-status-controls";
import type { OrderStatus, PaymentStatus, Order } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { updateOrderAction } from "./actions";

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
  const orders = await getOrders({
    paymentStatus: params?.paymentStatus,
    customerId: params?.customerId,
    q: params?.q,
    status: params?.status
  });

  return (
    <AdminLayout title="Orders" subtitle="Review order checks, fulfillment status, and payment state.">
      {params?.notice === "saved" ? <p className="admin-feedback success" role="status">Order saved.</p> : null}
      <form action="/admin/orders" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search order number, customer name, email, phone, location..." />
        <select name="status" defaultValue={params?.status ?? ""}>
          <option value="">All order status</option>
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
        <Link className="filter-reset" href="/admin/orders">All orders</Link>
      </form>
      <div className="admin-table">
        <div className="admin-table-row order-admin-heading">
          <span>Order</span>
          <span>Customer</span>
          <span>Total</span>
          <span>Payment</span>
          <span>Status</span>
          <span>Update</span>
        </div>
        {orders.map((order) => (
          <div className="admin-table-row order-admin-row" key={order.id}>
            <strong>{order.orderNumber}</strong>
            <span>
              {order.customerName}<br />
              <small>{order.customerPhone ?? order.customerEmail}</small>
              {order.deliveryLocation ? <small>{order.deliveryLocation}</small> : null}
              {order.deliveryMapUrl ? <a className="map-text-link" href={order.deliveryMapUrl} rel="noreferrer" target="_blank">Open map</a> : null}
            </span>
            <span>{formatMoney(order.totalCents)}</span>
            <OrderStatusControls action={updateOrderAction.bind(null, order.id)} initialPaymentStatus={order.paymentStatus} initialStatus={order.status} receiptHref={`/admin/walk-in-sale/${order.id}/receipt`} />
          </div>
        ))}
        {!orders.length ? <p className="empty-state">No orders yet.</p> : null}
      </div>
    </AdminLayout>
  );
}

async function getOrders(input: { q?: string; status?: string; paymentStatus?: string; customerId?: string }) {
  const terms = input.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  try {
    return apiFetch<Order[]>(`/admin/orders${toQueryString({
      q: terms.join(" "),
      customerId: input.customerId,
      status: orderStatuses.includes(input.status as OrderStatus) ? input.status : undefined,
      paymentStatus: paymentStatuses.includes(input.paymentStatus as PaymentStatus) ? input.paymentStatus : undefined
    })}`);
  } catch {
    return [];
  }
}
