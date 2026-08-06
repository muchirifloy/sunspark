"use client";

import { useState, useTransition } from "react";
import { announceCartCount } from "@/components/site/cart-events";
import type { ActionResult } from "@/lib/actions/result";

export function AddToCartButton({
  action,
  disabled = false,
}: {
  action: () => Promise<ActionResult>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function addToCart() {
    setMessage("");
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok && result.cartCount !== undefined) announceCartCount(result.cartCount);
    });
  }

  return (
    <span className="inline-cart-action">
      <button aria-busy={isPending} disabled={disabled || isPending} onClick={addToCart} type="button">
        {isPending ? "Adding..." : message === "Added to cart." ? "Added ✓" : "Cart"}
      </button>
      {message && message !== "Added to cart." ? <small role="alert">{message}</small> : null}
    </span>
  );
}
