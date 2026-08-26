"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Category } from "@/lib/types";

type Filters = {
  q?: string;
  category?: string;
  status?: string;
};

export function ProductFilters({ categories, initial }: { categories: Category[]; initial: Filters }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initial.q ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function show(next: Filters) {
    const params = new URLSearchParams();
    if (next.q?.trim()) params.set("q", next.q.trim());
    if (next.category) params.set("category", next.category);
    if (next.status) params.set("status", next.status);
    startTransition(() => router.replace(`/admin/products${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  function scheduleSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => show({ q: value, category, status }), 250);
  }

  return (
    <form
      aria-busy={isPending}
      className="admin-filter product-filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (searchTimer.current) clearTimeout(searchTimer.current);
        show({ q: query, category, status });
      }}
    >
      <input
        aria-label="Search products"
        name="q"
        onChange={(event) => scheduleSearch(event.target.value)}
        placeholder="Search product, brand, description..."
        type="search"
        value={query}
      />
      <select
        aria-label="Filter by category"
        name="category"
        onChange={(event) => {
          setCategory(event.target.value);
          show({ q: query, category: event.target.value, status });
        }}
        value={category}
      >
        <option value="">All categories</option>
        {categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}
      </select>
      <select
        aria-label="Filter by status"
        name="status"
        onChange={(event) => {
          setStatus(event.target.value);
          show({ q: query, category, status: event.target.value });
        }}
        value={status}
      >
        <option value="">All status</option>
        <option value="active">Active</option>
        <option value="hidden">Hidden</option>
        <option value="low">Low stock</option>
      </select>
      <button disabled={isPending} type="submit">{isPending ? "Updating..." : "Search"}</button>
      <Link className="filter-reset" href="/admin/products" onClick={() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        setQuery("");
        setCategory("");
        setStatus("");
      }}>All products</Link>
    </form>
  );
}
