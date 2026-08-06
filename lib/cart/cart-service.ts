import "server-only";

import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api/client";
import type { Product } from "@/lib/types";

const cartCookie = "sunspark_cart";

export type CartCookieItem = {
  slug: string;
  optionId?: string | null;
  quantity: number;
};

async function readCartCookie(): Promise<CartCookieItem[]> {
  const cookieStore = await cookies();
  const value = cookieStore.get(cartCookie)?.value;

  if (!value) {
    return [];
  }

  try {
    const items = JSON.parse(value) as CartCookieItem[];
    return items.filter((item) => item.slug && item.quantity > 0);
  } catch {
    return [];
  }
}

async function writeCartCookie(items: CartCookieItem[]) {
  const cookieStore = await cookies();
  cookieStore.set(cartCookie, JSON.stringify(items), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

function cartKey(item: Pick<CartCookieItem, "slug" | "optionId">) {
  return `${item.slug}::${item.optionId ?? ""}`;
}

function defaultOption(product: Product) {
  return product.options?.find((option) => option.isDefault) ?? product.options?.[0] ?? null;
}

export async function addCartItem(slug: string, quantity = 1, optionId?: string | null) {
  const items = await readCartCookie();
  const target = { slug, optionId: optionId || null };
  const existing = items.find((item) => cartKey(item) === cartKey(target));

  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ slug, optionId: optionId || null, quantity });
  }

  await writeCartCookie(items);
}

export async function getCartItemCount() {
  const items = await readCartCookie();
  return items.reduce((total, item) => total + item.quantity, 0);
}

export async function updateCartItem(slug: string, quantity: number, optionId?: string | null) {
  const items = await readCartCookie();
  const target = { slug, optionId: optionId || null };
  const matchesTarget = (item: CartCookieItem) => {
    if (cartKey(item) === cartKey(target)) return true;
    return item.slug === slug && (!item.optionId || !target.optionId);
  };
  const nextItems = quantity <= 0
    ? items.filter((item) => !matchesTarget(item))
    : items.map((item) => matchesTarget(item) ? { ...item, quantity } : item);
  await writeCartCookie(nextItems);
}

export async function clearCart() {
  const cookieStore = await cookies();
  cookieStore.delete(cartCookie);
}

export async function getCart() {
  const items = await readCartCookie();

  if (!items.length) {
    return { items: [], subtotalCents: 0 };
  }

  try {
    const products = await apiFetch<Product[]>(`/products/by-slugs?slugs=${encodeURIComponent(items.map((item) => item.slug).join(","))}`);

    const cartItems = items.flatMap((item) => {
      const product = products.find((candidate) => candidate.slug === item.slug);

      if (!product) {
        return [];
      }

      const quantity = Math.min(item.quantity, Math.max(product.stockQuantity, 0));
      const option = item.optionId
        ? product.options?.find((candidate) => candidate.id === item.optionId) ?? defaultOption(product)
        : defaultOption(product);
      const priceCents = option?.priceCents ?? product.priceCents;
      return quantity > 0
        ? [
            {
              product,
              option,
              cartOptionId: item.optionId ?? null,
              quantity,
              lineTotalCents: priceCents * quantity
            }
          ]
        : [];
    });

    return {
      items: cartItems,
      subtotalCents: cartItems.reduce((total, item) => total + item.lineTotalCents, 0)
    };
  } catch {
    return { items: [], subtotalCents: 0 };
  }
}
