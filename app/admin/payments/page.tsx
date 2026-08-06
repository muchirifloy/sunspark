import { AdminLayout } from "@/components/admin/admin-layout";
import { OrderStatusControls } from "@/components/admin/order-status-controls";
import type { Order, PaymentMethod, PaymentStatus } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { updateOrderAction } from "../orders/actions";

export const dynamic = "force-dynamic";
const paymentMethods: PaymentMethod[] = ["WHATSAPP", "MPESA", "CASH"];
const paymentStatuses: PaymentStatus[] = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export default async function AdminPaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; paymentStatus?: string; method?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const orders = await getPaymentOrders({
    method: params?.method,
    paymentStatus: params?.paymentStatus,
    q: params?.q
  });

  return (
    <AdminLayout title="Payments" subtitle="Verify payments and mark WhatsApp/M-Pesa orders as paid, failed, or pending.">
      <form action="/admin/payments" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search order, customer, email, phone..." />
        <select name="method" defaultValue={params?.method ?? ""}>
          <option value="">All methods</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="MPESA">M-Pesa</option>
          <option value="CASH">Cash</option>
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
      </form>
      <div className="admin-table">
        <div className="admin-table-row payment-heading">
          <span>Order</span>
          <span>Method</span>
          <span>Amount</span>
          <span>Payment Status</span>
          <span>Order Status</span>
          <span>Verify</span>
        </div>
        {orders.map((order) => (
          <div className="admin-table-row payment-row" key={order.id}>
            <strong>{order.orderNumber}</strong>
            <span>{order.paymentMethod}</span>
            <span>{formatMoney(order.totalCents)}</span>
            <OrderStatusControls action={updateOrderAction.bind(null, order.id)} initialPaymentStatus={order.paymentStatus} initialStatus={order.status} />
          </div>
        ))}
        {!orders.length ? <p className="empty-state">No payments to verify yet.</p> : null}
      </div>
    </AdminLayout>
  );
}

async function getPaymentOrders(input: { q?: string; paymentStatus?: string; method?: string }) {
  const terms = input.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  try {
    const orders = await apiFetch<Order[]>(`/admin/orders${toQueryString({
      q: terms.join(" "),
      paymentStatus: paymentStatuses.includes(input.paymentStatus as PaymentStatus) ? input.paymentStatus : undefined
    })}`);
    return orders.filter((order) => paymentMethods.includes(input.method as PaymentMethod) ? order.paymentMethod === input.method : true);
  } catch {
    return [];
  }
}
