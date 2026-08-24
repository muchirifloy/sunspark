import Link from "next/link";
import { requireCustomer } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireCustomer();
  const orders = await getOrders(user.id, user.email);

  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h1>Orders</h1>
        </div>
        <div className="admin-table">
          {orders.map((order) => (
            <div className="admin-table-row order-row" key={order.id}>
              <strong>{order.orderNumber}</strong>
              <span>{order.status}</span>
              <span>{formatMoney(order.totalCents)}</span>
              <Link href={`/account/orders/${order.id}`}>View</Link>
            </div>
          ))}
          {!orders.length ? <p className="empty-state">No orders yet.</p> : null}
        </div>
      </div>
    </section>
  );
}

async function getOrders(userId: string, email: string) {
  try {
    return apiFetch<Order[]>(`/orders${toQueryString({ userId, email })}`);
  } catch {
    return [];
  }
}
