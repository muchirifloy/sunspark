"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartCountEvent } from "@/components/site/cart-events";

export function CartStatusLink({ initialCount }: { initialCount: number }) {
  const [cartCount, setCartCount] = useState(initialCount);

  useEffect(() => {
    const updateCount = (event: Event) => setCartCount((event as CustomEvent<number>).detail);
    window.addEventListener(cartCountEvent, updateCount);
    return () => window.removeEventListener(cartCountEvent, updateCount);
  }, []);

  return (
    <Link aria-label={`${cartCount} items in cart`} className="icon-link cart-link" href="/cart">
      <span aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M7 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM4.2 4H2V2h3.8l1 4H21l-2 8.5H8.2L7.7 16H19v2H6.1L3.9 6 4.2 4Zm3.1 4 .9 4.5h9.2L18.5 8H7.3Z" /></svg></span>
      <strong>Cart</strong>
      <em aria-hidden="true">{cartCount}</em>
    </Link>
  );
}
