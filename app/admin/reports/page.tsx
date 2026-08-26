import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import type { Order, Product, PublicUser } from "@/lib/types";
import { emailDailyReportAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportView = "sales" | "stock" | "customers";
type ReportCustomer = PublicUser & { orders?: number; spentCents?: number };

const messages: Record<string, string> = {
  emailed: "Daily report emailed to the configured report address.",
  date: "Choose a valid report date.",
  email: "The report could not be emailed. Check SMTP settings and try again."
};

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ view?: string; date?: string; error?: string; notice?: string; message?: string }> }) {
  await requireAdmin("/admin/reports");
  const params = await searchParams;
  const view = (["stock", "customers"].includes(String(params?.view)) ? params?.view : "sales") as ReportView;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params?.date ?? "") ? params!.date! : new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const feedback = params?.error ? params.message ?? messages[params.error] : params?.notice ? messages[params.notice] : null;

  return <AdminLayout title="Reports" subtitle="Review sales, profit, stock health, and customer activity from live store records.">
    <nav className="report-tabs" aria-label="Report type">
      <Link className={view === "sales" ? "active" : ""} href="/admin/reports">Sales report</Link>
      <Link className={view === "stock" ? "active" : ""} href="/admin/reports?view=stock">Stock report</Link>
      <Link className={view === "customers" ? "active" : ""} href="/admin/reports?view=customers">Customer report</Link>
    </nav>
    {feedback ? <p className={`admin-feedback ${params?.error ? "error" : "success"}`} role="status">{feedback}</p> : null}
    {/* The tabs switch instantly; the report itself streams in behind them, so moving
        between reports no longer blanks the screen while a query runs. */}
    <AdminSectionErrorBoundary message="The report could not be loaded. This is a connection problem, not an empty report. Reload to try again.">
      <Suspense fallback={<ReportSkeleton />} key={`${view}-${date}`}>
        <ReportBody date={date} view={view} />
      </Suspense>
    </AdminSectionErrorBoundary>
  </AdminLayout>;
}

async function ReportBody({ date, view }: { date: string; view: ReportView }) {
  if (view === "stock") return <StockReport report={await getStockReport()} />;
  if (view === "customers") return <CustomerReport customers={await getCustomerReport()} />;
  return <SalesReport date={date} report={await getDailyReport(date)} />;
}

function ReportSkeleton() {
  return (
    <div aria-busy="true">
      <div className="admin-stats report-stats admin-skeleton-grid">
        <span className="admin-card-skeleton" />
        <span className="admin-card-skeleton" />
        <span className="admin-card-skeleton" />
      </div>
      <div className="admin-table">
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="admin-table-row report-row admin-row-skeleton" key={row}>
            <span /><span /><span /><span /><span />
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesReport({ date, report }: { date: string; report: Awaited<ReturnType<typeof getDailyReport>> }) {
  return <>
    <form action="/admin/reports" className="admin-filter report-filter"><input defaultValue={date} name="date" type="date" /><button type="submit">Run report</button><button formAction={emailDailyReportAction} type="submit">Email report</button></form>
    <div className="admin-stats report-stats"><Stat label="Completed sales" value={String(report.orders)} /><Stat label="Revenue" value={formatMoney(report.revenueCents)} /><Stat label="Gross profit" value={formatMoney(report.profitCents)} /></div>
    <div className="admin-table"><div className="admin-table-row report-row heading"><span>Product</span><span>Quantity</span><span>Revenue</span><span>Buying cost</span><span>Profit</span></div>
      {report.items.map((item) => <div className="admin-table-row report-row" key={item.key}><strong>{item.name}</strong><span>{item.quantity}</span><span>{formatMoney(item.revenueCents)}</span><span>{formatMoney(item.costCents)}</span><strong>{formatMoney(item.profitCents)}</strong></div>)}
      {!report.items.length ? <p className="empty-state">No completed sales for this date.</p> : null}
    </div>
  </>;
}

function StockReport({ report }: { report: Awaited<ReturnType<typeof getStockReport>> }) {
  const products = report.products;
  const out = products.filter((product) => product.stockQuantity <= 0);
  const low = products.filter((product) => product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold);
  return <>
    <div className="admin-stats report-stats"><Stat label="Low or out of stock" value={String(report.total)} /><Stat label="Out of stock shown" value={String(out.length)} /><Stat label="Items shown" value={String(products.length)} /></div>
    <div className="admin-table"><div className="admin-table-row stock-report-row heading"><span>Product</span><span>Category</span><span>Quantity</span><span>Low alert</span><span>Status</span></div>
      {[...out, ...low].map((product) => <div className="admin-table-row stock-report-row" key={product.id}><Link className="table-link" href={`/admin/products/${product.id}/edit`}>{product.name}</Link><span>{product.category.name}</span><strong>{product.stockQuantity}</strong><span>{product.lowStockThreshold}</span><span className={`stock-pill ${product.stockQuantity <= 0 ? "out" : "low"}`}>{product.stockQuantity <= 0 ? "Out of stock" : "Low stock"}</span></div>)}
      {!out.length && !low.length ? <p className="empty-state">All active products are above their low-stock alerts.</p> : null}
    </div>
  </>;
}

function CustomerReport({ customers }: { customers: ReportCustomer[] }) {
  const active = customers.filter((customer) => Number(customer.orders ?? 0) > 0);
  const spent = customers.reduce((total, customer) => total + Number(customer.spentCents ?? 0), 0);
  return <>
    <div className="admin-stats report-stats"><Stat label="Registered customers" value={String(customers.length)} /><Stat label="Customers with orders" value={String(active.length)} /><Stat label="Recorded spend" value={formatMoney(spent)} /></div>
    <div className="admin-table"><div className="admin-table-row customer-report-row heading"><span>Customer</span><span>Contact</span><span>Orders</span><span>Recorded spend</span></div>
      {customers.map((customer) => <div className="admin-table-row customer-report-row" key={customer.id}><strong>{customer.name}</strong><span>{customer.email}<small>{customer.phone ?? "No phone"}</small></span><Link className="table-link" href={`/admin/orders?customerId=${encodeURIComponent(customer.id)}`}>{Number(customer.orders ?? 0)} orders</Link><strong>{formatMoney(Number(customer.spentCents ?? 0))}</strong></div>)}
      {!customers.length ? <p className="empty-state">No registered customers yet.</p> : null}
    </div>
  </>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>; }

async function getDailyReport(date: string) {
  const start = new Date(`${date}T00:00:00+03:00`);
  const end = new Date(`${date}T23:59:59.999+03:00`);
  const allOrders = await apiFetch<Order[]>("/admin/orders").catch(() => []);
  const orders = allOrders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= start && createdAt <= end && order.status !== "CANCELLED";
  });
  const lines = new Map<string, { key: string; name: string; quantity: number; revenueCents: number; costCents: number; profitCents: number }>();
  for (const order of orders) for (const item of order.items) {
    const key = item.productId ?? item.productName;
    const existing = lines.get(key) ?? { key, name: item.productName, quantity: 0, revenueCents: 0, costCents: 0, profitCents: 0 };
    existing.quantity += item.quantity; existing.revenueCents += item.totalCents; existing.costCents += item.costCents * item.quantity; existing.profitCents += item.totalCents - item.costCents * item.quantity;
    lines.set(key, existing);
  }
  const items = [...lines.values()].sort((a, b) => b.revenueCents - a.revenueCents);
  return { orders: orders.length, items, revenueCents: items.reduce((total, item) => total + item.revenueCents, 0), profitCents: items.reduce((total, item) => total + item.profitCents, 0) };
}

async function getStockReport() {
  return apiFetch<{ products: Product[]; total: number }>("/admin/products?perPage=100&status=low").catch(() => ({ products: [], total: 0 }));
}

async function getCustomerReport() {
  return apiFetch<ReportCustomer[]>("/admin/customers");
}
