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
    const parsed = JSON.parse(value) as CartCookieItem[];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.slug === "string" && item.slug)
      .map((item) => ({
        slug: item.slug,
        optionId: item.optionId ?? null,
        quantity: normalizeQuantity(Number(item.quantity))
      }))
      .filter((item) => item.quantity > 0)
      .slice(0, maxCartLines);
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

// The cart lives entirely in a cookie, so an unbounded one eventually exceeds
// the request header limit and locks the visitor out of the whole site with a
// 431 rather than just breaking the cart.
const maxCartLines = 50;
const maxLineQuantity = 999;

export class CartLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartLimitError";
  }
}

function cartKey(item: Pick<CartCookieItem, "slug" | "optionId">) {
  return `${item.slug}::${item.optionId ?? ""}`;
}

function normalizeQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) return 0;
  return Math.min(Math.max(Math.floor(quantity), 0), maxLineQuantity);
}

function defaultOption(product: Product) {
  return product.options?.find((option) => option.isDefault) ?? product.options?.[0] ?? null;
}

export async function addCartItem(slug: string, quantity = 1, optionId?: string | null) {
  const items = await readCartCookie();
  const target = { slug, optionId: optionId || null };
  const existing = items.find((item) => cartKey(item) === cartKey(target));

  if (existing) {
    existing.quantity = normalizeQuantity(existing.quantity + quantity);
  } else {
    if (items.length >= maxCartLines) {
      throw new CartLimitError("Your cart is full. Remove a product before adding another.");
    }

    items.push({ slug, optionId: optionId || null, quantity: normalizeQuantity(quantity) });
  }

  await writeCartCookie(items.filter((item) => item.quantity > 0));
}

export async function getCartItemCount() {
  const items = await readCartCookie();
  return items.reduce((total, item) => total + item.quantity, 0);
}

export async function updateCartItem(slug: string, quantity: number, optionId?: string | null) {
  const items = await readCartCookie();
  const target = { slug, optionId: optionId || null };
  const exactMatch = items.findIndex((item) => cartKey(item) === cartKey(target));

  // An edit must land on exactly one line. The previous loose fallback could
  // match every line for the same product, so changing one option's quantity
  // silently rewrote the others too. Fall back to a single unambiguous line
  // only when there is no exact match.
  const looseMatches = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.slug === slug);
  const targetIndex = exactMatch !== -1 ? exactMatch : looseMatches.length === 1 ? looseMatches[0].index : -1;

  if (targetIndex === -1) {
    return;
  }

  const nextQuantity = normalizeQuantity(quantity);
  const nextItems = nextQuantity <= 0
    ? items.filter((_item, index) => index !== targetIndex)
    : items.map((item, index) => (index === targetIndex ? { ...item, quantity: nextQuantity } : item));

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
