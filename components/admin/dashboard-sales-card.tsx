"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";

export type ChartPeriod = "days" | "weeks" | "months";
export type SalesBucket = { bucket: string; label: string; orders: number; salesCents: number; profitCents: number };

const periods: ChartPeriod[] = ["days", "weeks", "months"];

export function DashboardSalesCard({ summaries }: { summaries: Record<ChartPeriod, SalesBucket[]> }) {
  const [period, setPeriod] = useState<ChartPeriod>("days");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const buckets = summaries[period];

  function changePeriod(nextPeriod: ChartPeriod) {
    setPeriod(nextPeriod);
    setHoveredIndex(null);
  }

  return (
    <section className="dashboard-card dashboard-sales-card">
      <header className="dashboard-card-header">
        <div><span>Performance</span><h2>Sales overview</h2></div>
        <div className="dashboard-periods" aria-label="Chart period" role="group">
          {periods.map((item) => (
            <button
              aria-pressed={item === period}
              className={item === period ? "active" : ""}
              key={item}
              onClick={() => changePeriod(item)}
              type="button"
            >
              {periodLabel(item)}
            </button>
          ))}
        </div>
      </header>
      <SalesLineChart buckets={buckets} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />
    </section>
  );
}

function SalesLineChart({
  buckets,
  hoveredIndex,
  onHover,
}: {
  buckets: SalesBucket[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  if (!buckets.length) return <p className="dashboard-empty dashboard-chart-empty">No sales data is available for this period.</p>;

  const width = 780;
  const height = 300;
  const plot = { left: 74, right: 716, top: 24, bottom: 244 };
  const maxSales = niceMaximum(Math.max(...buckets.map((item) => item.salesCents), 1));
  const maxOrders = niceOrderMaximum(Math.max(...buckets.map((item) => item.orders), 0));
  const points = buckets.map((bucket, index) => {
    const x = plot.left + (index * (plot.right - plot.left)) / Math.max(buckets.length - 1, 1);
    return {
      bucket,
      ordersY: plot.bottom - (bucket.orders / maxOrders) * (plot.bottom - plot.top),
      salesY: plot.bottom - (bucket.salesCents / maxSales) * (plot.bottom - plot.top),
      x,
    };
  });
  const activePoint = hoveredIndex === null ? null : points[hoveredIndex];

  return (
    <div className="dashboard-chart-wrap">
      <div className="dashboard-chart-legend"><span className="sales">Sales (KES)</span><span className="orders">Orders</span><small>Hover or tap a point for details</small></div>
      <svg aria-label="Sales and orders performance chart" className="dashboard-line-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = plot.bottom - ratio * (plot.bottom - plot.top);
          return (
            <g className="dashboard-axis-tick" key={ratio}>
              <line x1={plot.left} x2={plot.right} y1={y} y2={y} />
              <text textAnchor="end" x={plot.left - 10} y={y + 4}>{formatCompactMoney(maxSales * ratio)}</text>
              <text textAnchor="start" x={plot.right + 10} y={y + 4}>{formatCompactNumber(maxOrders * ratio)}</text>
            </g>
          );
        })}
        <text className="dashboard-axis-title" textAnchor="start" x={plot.left} y={14}>Sales</text>
        <text className="dashboard-axis-title" textAnchor="end" x={plot.right} y={14}>Orders</text>
        <polyline className="orders-line" fill="none" points={points.map((point) => `${point.x},${point.ordersY}`).join(" ")} />
        <polyline className="sales-line" fill="none" points={points.map((point) => `${point.x},${point.salesY}`).join(" ")} />
        {points.map((point, index) => {
          const previousX = points[index - 1]?.x ?? plot.left;
          const nextX = points[index + 1]?.x ?? plot.right;
          const hitLeft = index === 0 ? plot.left : (previousX + point.x) / 2;
          const hitRight = index === points.length - 1 ? plot.right : (point.x + nextX) / 2;
          return (
            <g key={point.bucket.bucket}>
              <rect
                aria-label={`${point.bucket.label}: ${formatMoney(point.bucket.salesCents)}, ${point.bucket.orders} orders, ${formatMoney(point.bucket.profitCents)} gross profit`}
                className="dashboard-chart-hit-area"
                height={plot.bottom - plot.top}
                onBlur={() => onHover(null)}
                onClick={() => onHover(index)}
                onFocus={() => onHover(index)}
                onMouseEnter={() => onHover(index)}
                onMouseLeave={() => onHover(null)}
                role="button"
                tabIndex={0}
                width={Math.max(hitRight - hitLeft, 1)}
                x={hitLeft}
                y={plot.top}
              />
              <circle className="orders-point" cx={point.x} cy={point.ordersY} r={hoveredIndex === index ? 5 : 3.5} />
              <circle className="sales-point" cx={point.x} cy={point.salesY} r={hoveredIndex === index ? 6 : 4.5} />
              <text className="dashboard-x-label" textAnchor="middle" x={point.x} y={plot.bottom + 26}>{point.bucket.label}</text>
            </g>
          );
        })}
        {activePoint ? <ChartTooltip point={activePoint} plot={plot} /> : null}
      </svg>
    </div>
  );
}

function ChartTooltip({
  point,
  plot,
}: {
  point: { bucket: SalesBucket; ordersY: number; salesY: number; x: number };
  plot: { left: number; right: number; top: number; bottom: number };
}) {
  const tooltipWidth = 184;
  const tooltipX = Math.min(Math.max(point.x - tooltipWidth / 2, plot.left), plot.right - tooltipWidth);
  const tooltipY = 34;
  return (
    <g className="dashboard-chart-tooltip" pointerEvents="none">
      <line className="dashboard-hover-guide" x1={point.x} x2={point.x} y1={plot.top} y2={plot.bottom} />
      <rect height="86" rx="8" width={tooltipWidth} x={tooltipX} y={tooltipY} />
      <text className="tooltip-title" x={tooltipX + 12} y={tooltipY + 20}>{point.bucket.label}</text>
      <text x={tooltipX + 12} y={tooltipY + 40}>Sales: {formatMoney(point.bucket.salesCents)}</text>
      <text x={tooltipX + 12} y={tooltipY + 58}>Orders: {point.bucket.orders}</text>
      <text x={tooltipX + 12} y={tooltipY + 76}>Gross profit: {formatMoney(point.bucket.profitCents)}</text>
      <title>{`${point.bucket.label} performance details`}</title>
    </g>
  );
}

function niceMaximum(value: number) {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function niceOrderMaximum(value: number) {
  return Math.max(4, Math.ceil(value / 4) * 4);
}

function formatCompactMoney(cents: number) {
  return `KSH ${formatCompactNumber(cents / 100)}`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function periodLabel(period: ChartPeriod) {
  return period === "days" ? "7 days" : period === "weeks" ? "4 weeks" : "5 months";
}
