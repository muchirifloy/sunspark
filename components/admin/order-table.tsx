import Link from "next/link";
import { OrderStatusControls } from "@/components/admin/order-status-controls";
import { updateOrderAction } from "@/app/admin/orders/actions";
import { formatMoney } from "@/lib/money";
import type { Order } from "@/lib/types";

/**
 * Shared by the working order list and the past-orders list so the two cannot
 * drift apart. The order number and the customer name are both links because
 * those are the two things an operator reads when scanning for a specific sale.
 */
export function OrderTable({ emptyMessage, orders }: { emptyMessage: string; orders: Order[] }) {
  return (
    <div className="admin-table">
      <div className="admin-table-row order-admin-heading">
        <span>Order</span>
        <span>Customer</span>
        <span>Total</span>
        <span>Payment</span>
        <span>Status</span>
        <span>Update</span>
      </div>
      {orders.map((order) => {
        const orderHref = `/admin/walk-in-sale/${order.id}/receipt`;

        return (
          <div className="admin-table-row order-admin-row" key={order.id}>
            <strong>
              <Link className="admin-record-link" href={orderHref}>{order.orderNumber}</Link>
              <small>{new Date(order.createdAt).toLocaleDateString("en-KE")}</small>
            </strong>
            <span>
              <Link className="admin-record-link" href={orderHref}>{order.customerName}</Link>
              <br />
              <small>{order.customerPhone ?? order.customerEmail}</small>
              {order.deliveryLocation ? <small>{order.deliveryLocation}</small> : null}
              {order.deliveryMapUrl ? <a className="map-text-link" href={order.deliveryMapUrl} rel="noreferrer" target="_blank">Open map</a> : null}
            </span>
            <span>{formatMoney(order.totalCents)}</span>
            <OrderStatusControls
              action={updateOrderAction.bind(null, order.id)}
              initialPaymentStatus={order.paymentStatus}
              initialStatus={order.status}
              receiptHref={orderHref}
            />
          </div>
        );
      })}
      {!orders.length ? <p className="empty-state">{emptyMessage}</p> : null}
    </div>
  );
}
