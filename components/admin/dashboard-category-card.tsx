"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";

type CategorySale = { name: string; salesCents: number; units: number };

const colors = ["#5b21b6", "#7c3aed", "#f36f21", "#0e52a4", "#16a085", "#64748b"];

export function DashboardCategoryCard({ categories }: { categories: CategorySale[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = hoveredIndex ?? selectedIndex;
  const total = categories.reduce((sum, item) => sum + item.salesCents, 0);
  const activeCategory = activeIndex === null ? null : categories[activeIndex];
  let cumulative = 0;

  return (
    <section className="dashboard-card dashboard-category-card">
      <header className="dashboard-card-header"><div><span>Last 30 days</span><h2>Sales by category</h2></div></header>
      <div className="dashboard-category-breakdown">
        <div className="dashboard-donut dashboard-donut-interactive">
          <svg aria-label="Sales by category chart" role="img" viewBox="0 0 200 200">
            <circle className="dashboard-donut-track" cx="100" cy="100" pathLength="100" r="72" />
            {categories.map((item, index) => {
              const percentage = total ? (item.salesCents / total) * 100 : 0;
              const offset = cumulative;
              cumulative += percentage;
              return (
                <circle
                  aria-label={`${item.name}: ${formatMoney(item.salesCents)}, ${percentage.toFixed(1)}%, ${item.units} units`}
                  className={activeIndex === index ? "dashboard-donut-segment active" : "dashboard-donut-segment"}
                  cx="100"
                  cy="100"
                  key={item.name}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={() => setSelectedIndex((current) => current === index ? null : index)}
                  onFocus={() => setHoveredIndex(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  pathLength="100"
                  r="72"
                  role="button"
                  stroke={colors[index % colors.length]}
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={-offset}
                  tabIndex={0}
                />
              );
            })}
          </svg>
          <div aria-live="polite">
            <strong>{activeCategory ? activeCategory.name : formatMoney(total)}</strong>
            <span>{activeCategory ? formatMoney(activeCategory.salesCents) : "Total sales"}</span>
            {activeCategory ? <small>{total ? ((activeCategory.salesCents / total) * 100).toFixed(1) : "0.0"}% · {activeCategory.units} units</small> : null}
          </div>
        </div>
        <div className="dashboard-category-list">
          {categories.map((item, index) => (
            <button
              className={activeIndex === index ? "active" : ""}
              key={item.name}
              onBlur={() => setHoveredIndex(null)}
              onClick={() => setSelectedIndex((current) => current === index ? null : index)}
              onFocus={() => setHoveredIndex(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              type="button"
            >
              <i style={{ background: colors[index % colors.length] }}></i>
              <span><strong>{item.name}</strong><small>{total ? ((item.salesCents / total) * 100).toFixed(1) : "0.0"}% · {formatMoney(item.salesCents)}</small></span>
            </button>
          ))}
          {!categories.length ? <p className="dashboard-empty">Category sales will appear here.</p> : null}
        </div>
      </div>
    </section>
  );
}
