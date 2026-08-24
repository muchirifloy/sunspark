import { notFound } from "next/navigation";
import { SalesDocument } from "@/components/admin/sales-document";
import { requireCustomer } from "@/lib/auth/guards";
import { getOrderInvoice } from "@/lib/invoices/invoice-service";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomer(`/account/orders/${id}`);
  const order = await getOrderInvoice(id, { userId: user.id, email: user.email });

  if (!order) {
    notFound();
  }

  return (
    <section className="section">
      <div className="container invoice-page">
        <div className="section-title">
          <h1>Invoice {order.invoice?.invoiceNumber}</h1>
        </div>
        <SalesDocument
          customerEmail={order.customerEmail}
          customerName={order.customerName}
          customerPhone={order.customerPhone}
          date={order.createdAt}
          items={order.items}
          kind="INVOICE"
          number={order.invoice?.invoiceNumber ?? order.orderNumber}
          paymentLabel={order.paymentMethod}
          statusLabel={order.paymentStatus}
          subtotalCents={order.subtotalCents}
          totalCents={order.totalCents}
        />
      </div>
    </section>
  );
}
