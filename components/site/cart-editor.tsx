"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { announceCartCount } from "@/components/site/cart-events";
import { formatMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/result";

export type CartEditorItem = {
  imageAlt: string;
  imageUrl: string | null;
  key: string;
  name: string;
  optionId: string | null;
  optionLabel: string | null;
  priceCents: number;
  quantity: number;
  slug: string;
  stockQuantity: number;
};

export function CartEditor({
  action,
  initialItems,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  initialItems: CartEditorItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState("");
  const [error, setError] = useState("");
  const subtotalCents = items.reduce((total, item) => total + item.priceCents * item.quantity, 0);

  function updateQuantity(item: CartEditorItem, quantity: number) {
    if (isPending) return;
    const previousItems = items;
    const nextQuantity = Math.max(0, Math.min(quantity, item.stockQuantity));
    setItems((current) => nextQuantity === 0
      ? current.filter((candidate) => candidate.key !== item.key)
      : current.map((candidate) => candidate.key === item.key ? { ...candidate, quantity: nextQuantity } : candidate));
    setPendingKey(item.key);
    setError("");

    const formData = new FormData();
    formData.set("slug", item.slug);
    formData.set("optionId", item.optionId ?? "");
    formData.set("quantity", String(nextQuantity));
    startTransition(async () => {
      const result = await action(formData);
      setPendingKey("");
      if (!result.ok) {
        setItems(previousItems);
        setError(result.message);
        return;
      }
      if (result.cartCount !== undefined) announceCartCount(result.cartCount);
    });
  }

  return (
    <div className="checkout-layout">
      <div>
        <div className="section-title"><h3>Shopping Cart</h3></div>
        {items.length ? (
          <div className="cart-list-page" aria-busy={isPending}>
            {items.map((item) => (
              <article className="cart-row" key={item.key}>
                <Link className="cart-thumb" href={`/product/${item.slug}`}>
                  {item.imageUrl ? <Image src={item.imageUrl} alt={item.imageAlt} fill sizes="90px" /> : <span>No image</span>}
                </Link>
                <div className="cart-item-main">
                  <Link href={`/product/${item.slug}`}><h2>{item.name}</h2></Link>
                  <p>{item.optionLabel ? <small>{item.optionLabel}</small> : null}<span>{formatMoney(item.priceCents)}</span><small> each</small></p>
                </div>
                <div className="cart-stepper" aria-label={`Quantity for ${item.name}`}>
                  <button aria-label={`Reduce ${item.name}`} disabled={isPending || item.quantity <= 1} onClick={() => updateQuantity(item, item.quantity - 1)} type="button">−</button>
                  <strong>{pendingKey === item.key ? "…" : item.quantity}</strong>
                  <button aria-label={`Add one ${item.name}`} disabled={isPending || item.quantity >= item.stockQuantity} onClick={() => updateQuantity(item, item.quantity + 1)} type="button">+</button>
                </div>
                <div className="cart-line-total"><span>Total</span><strong>{formatMoney(item.priceCents * item.quantity)}</strong></div>
                <button className="cart-remove" disabled={isPending} onClick={() => updateQuantity(item, 0)} type="button">Remove</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-products"><h2>Your cart is empty</h2><Link className="primary-btn" href="/store">Continue shopping</Link></div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
      <aside className="order-summary">
        <h2>Cart Summary</h2>
        <div className="summary-line"><span>Subtotal</span><strong>{formatMoney(subtotalCents)}</strong></div>
        {items.length ? <Link className="primary-btn" href="/checkout">Checkout</Link> : null}
      </aside>
    </div>
  );
}
