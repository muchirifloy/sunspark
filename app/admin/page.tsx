import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { AdminLayout } from "@/components/admin/admin-layout";
import { DashboardCategoryCard } from "@/components/admin/dashboard-category-card";
import { DashboardSalesCard, type ChartPeriod, type SalesBucket } from "@/components/admin/dashboard-sales-card";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

type DashboardOverview = {
  metrics: {
    salesCents: number;
    previousSalesCents: number;
    profitCents: number;
    previousProfitCents: number;
    orders: number;
    previousOrders: number;
    customers: number;
    newCustomers7Days: number;
    previousCustomers: number;
    averageOrderCents: number;
  };
  categories: { name: string; salesCents: number; units: number }[];
  topProducts: { productId: string | null; name: string; salesCents: number; units: number }[];
  recentOrders: { id: string; orderNumber: string; customerName: string; totalCents: number; status: string; createdAt: string }[];
  inventory: { total: number; healthy: number; low: number; outOfStock: number };
  sms: {
    configured: boolean;
    promotionalReady: boolean;
    dryRun: boolean;
    messages7Days: number;
    segments7Days: number;
    messages30Days: number;
    segments30Days: number;
    failed30Days: number;
  };
};

export default async function AdminDashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; preview?: string }>;
}) {
  const params = await searchParams;
  const preview = process.env.NODE_ENV === "development" && params?.preview === "1";
  const admin = preview ? { name: "Sunspark Admin" } : await requireAdmin();
  return <AdminDashboard adminName={admin.name} params={params} preview={preview} />;
}

async function AdminDashboard({
  adminName,
  params,
  preview = false
}: {
  adminName: string;
  params?: { error?: string };
  preview?: boolean;
}) {
  return (
    <AdminLayout
      title="Overview"
      subtitle={`Welcome back, ${adminName}. Here is what is happening with your store.`}
      actions={<Link className="primary-btn" href="/admin/products/new">Add product</Link>}
      pendingOrderCountOverride={preview ? 12 : undefined}
      roleOverride={preview ? "ADMIN" : undefined}
    >
      {params?.error === "permission" ? <p className="admin-feedback error" role="alert">This section is restricted to the owner admin account.</p> : null}

      <AdminSectionErrorBoundary message="The dashboard figures could not be loaded. Reload to try again.">
        <Suspense fallback={<MetricsSkeleton />}>
          <DashboardMetrics />
        </Suspense>
      </AdminSectionErrorBoundary>

      <div className="dashboard-grid dashboard-grid-primary">
        <AdminSectionErrorBoundary message="The sales chart could not be loaded.">
          <Suspense fallback={<div className="dashboard-card admin-card-skeleton" />}>
            <SalesChart />
          </Suspense>
        </AdminSectionErrorBoundary>
        <AdminSectionErrorBoundary message="Category sales could not be loaded.">
          <Suspense fallback={<div className="dashboard-card admin-card-skeleton" />}>
            <CategoryBreakdown />
          </Suspense>
        </AdminSectionErrorBoundary>
      </div>

      <AdminSectionErrorBoundary message="The dashboard lists could not be loaded.">
        <Suspense fallback={<div className="dashboard-grid dashboard-grid-secondary"><div className="dashboard-card admin-card-skeleton" /><div className="dashboard-card admin-card-skeleton" /><div className="dashboard-card admin-card-skeleton" /></div>}>
          <DashboardLists />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

/**
 * Each block below fetches what it needs and nothing more.
 *
 * getOverview is wrapped in React's cache(), so the four blocks that want it share a
 * single request per render rather than issuing four - splitting the page for streaming
 * must not quadruple the load on the API.
 */
async function DashboardMetrics() {
  const overview = await getOverview();
  const metrics = overview.metrics;

  return (
      <section className="dashboard-metrics" aria-label="Store summary">
        <DashboardMetric change={change(metrics.salesCents, metrics.previousSalesCents)} label="Total sales" value={formatMoney(metrics.salesCents)} />
        <DashboardMetric change={change(metrics.orders, metrics.previousOrders)} label="Total orders" value={String(metrics.orders)} />
        <DashboardMetric change={change(metrics.profitCents, metrics.previousProfitCents)} label="Gross profit" value={formatMoney(metrics.profitCents)} />
        <DashboardMetric label="Online customers" note={`${metrics.newCustomers7Days ?? 0} new in 7 days`} value={String(metrics.customers)} />
        <DashboardMetric label="Avg. order value" value={formatMoney(metrics.averageOrderCents)} />
        <DashboardMetric
          href="/admin/sms"
          label="SMS sent"
          note={smsNote(overview.sms)}
          value={String(overview.sms.messages7Days)}
        />
      </section>
  );
}

async function SalesChart() {
  const [days, weeks, months] = await Promise.all([
    getSalesSummary("days"),
    getSalesSummary("weeks"),
    getSalesSummary("months")
  ]);
  return <DashboardSalesCard summaries={{ days: days.buckets, weeks: weeks.buckets, months: months.buckets }} />;
}

async function CategoryBreakdown() {
  const overview = await getOverview();
  return <DashboardCategoryCard categories={overview.categories} />;
}

async function DashboardLists() {
  const overview = await getOverview();

  return (
      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="dashboard-card">
          <DashboardCardHeader title="Recent orders"><Link className="dashboard-view-link" href="/admin/orders">View all</Link></DashboardCardHeader>
          <div className="dashboard-order-list">
            {overview.recentOrders.map((order) => (
              <Link className="dashboard-order-row" href={`/admin/orders?q=${encodeURIComponent(order.orderNumber)}`} key={order.id}>
                <span><strong>#{order.orderNumber}</strong><small>{order.customerName}</small></span>
                <strong>{formatMoney(order.totalCents)}</strong>
                <span className={`dashboard-status ${order.status.toLowerCase()}`}>{order.status.toLowerCase()}</span>
                <time>{new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</time>
              </Link>
            ))}
            {!overview.recentOrders.length ? <p className="dashboard-empty">No orders have been recorded yet.</p> : null}
          </div>
        </section>

        <section className="dashboard-card">
          <DashboardCardHeader eyebrow="Last 30 days" title="Top selling products"><Link className="dashboard-view-link" href="/admin/products">Products</Link></DashboardCardHeader>
          <ol className="dashboard-product-list">
            {overview.topProducts.map((product, index) => (
              <li key={`${product.productId ?? product.name}-${index}`}>
                <span className="dashboard-rank">{index + 1}</span>
                <span><strong>{product.name}</strong><small>{product.units} units</small></span>
                <strong>{formatMoney(product.salesCents)}</strong>
              </li>
            ))}
          </ol>
          {!overview.topProducts.length ? <p className="dashboard-empty">Sales will rank products here.</p> : null}
        </section>

        <section className="dashboard-card">
          <DashboardCardHeader title="Inventory health"><Link className="dashboard-view-link" href="/admin/products?status=low">Review stock</Link></DashboardCardHeader>
          <InventoryHealth inventory={overview.inventory} />
        </section>
      </div>
  );
}

function MetricsSkeleton() {
  return (
    <section className="dashboard-metrics" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((card) => <span className="admin-card-skeleton" key={card} />)}
    </section>
  );
}

function DashboardMetric({ change: delta, href, label, note, value }: { change?: number | null; href?: string; label: string; note?: string; value: string }) {
  const valueSize = value.length >= 18 ? "tight" : value.length >= 14 ? "compact" : undefined;
  const body = (
    <>
      <div><span>{label}</span><strong className={valueSize}>{value}</strong></div>
      <small className={note ? "muted" : delta !== undefined && delta !== null && delta < 0 ? "down" : "up"}>
        {note ?? (delta === null || delta === undefined ? "Last 7 days" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}% vs previous 7 days`)}
      </small>
    </>
  );

  return href
    ? <Link className="dashboard-metric" href={href}>{body}</Link>
    : <article className="dashboard-metric">{body}</article>;
}

/**
 * The one thing worth saying about SMS in a single line.
 *
 * A failure is what an owner needs to act on, so it wins over the volume; an unconfigured
 * or paused gateway wins over both, because then nothing is going out at all.
 */
function smsNote(sms: DashboardOverview["sms"]) {
  if (!sms.configured) return "Not configured";
  if (sms.dryRun) return "Dry run - nothing is sent";
  if (sms.failed30Days) return `${sms.failed30Days} failed in 30 days`;
  return `${sms.segments30Days} credits in 30 days`;
}

function DashboardCardHeader({ children, eyebrow, title }: { children?: ReactNode; eyebrow?: string; title: string }) {
  return <header className="dashboard-card-header"><div>{eyebrow ? <span>{eyebrow}</span> : null}<h2>{title}</h2></div>{children}</header>;
}

function InventoryHealth({ inventory }: { inventory: DashboardOverview["inventory"] }) {
  const safeTotal = Math.max(inventory.total, 1);
  return (
    <div className="dashboard-inventory">
      <div className="dashboard-inventory-total"><strong>{inventory.total}</strong><span>Active products</span></div>
      <div className="dashboard-inventory-bar" aria-label={`${inventory.healthy} healthy, ${inventory.low} low, ${inventory.outOfStock} out of stock`}>
        <span className="healthy" style={{ width: `${(inventory.healthy / safeTotal) * 100}%` }}></span>
        <span className="low" style={{ width: `${(inventory.low / safeTotal) * 100}%` }}></span>
        <span className="out" style={{ width: `${(inventory.outOfStock / safeTotal) * 100}%` }}></span>
      </div>
      <div className="dashboard-inventory-list"><span><i className="healthy"></i>Healthy <strong>{inventory.healthy}</strong></span><span><i className="low"></i>Low stock <strong>{inventory.low}</strong></span><span><i className="out"></i>Out of stock <strong>{inventory.outOfStock}</strong></span></div>
    </div>
  );
}

function change(current: number, previous: number) {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / previous) * 100;
}

const getOverview = cache(async () => apiFetch<DashboardOverview>("/admin/dashboard-overview"));

async function getSalesSummary(period: ChartPeriod) {
  return apiFetch<{ period: ChartPeriod; buckets: SalesBucket[] }>(`/admin/sales-summary${toQueryString({ period })}`).catch(() => ({ period, buckets: [] }));
}
