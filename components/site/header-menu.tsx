"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartCountEvent } from "@/components/site/cart-events";

type HeaderMenuCategory = {
  name: string;
  slug: string;
};

type HeaderMenuSession = {
  name: string;
} | null;

export function HeaderMenu({
  cartCount,
  categories,
  logoutAction,
  session
}: {
  cartCount: number;
  categories: HeaderMenuCategory[];
  logoutAction: () => Promise<void>;
  session: HeaderMenuSession;
}) {
  const [open, setOpen] = useState(false);
  const [currentCartCount, setCurrentCartCount] = useState(cartCount);

  function closeMenu() {
    setOpen(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const updateCount = (event: Event) => setCurrentCartCount((event as CustomEvent<number>).detail);
    window.addEventListener(cartCountEvent, updateCount);
    return () => window.removeEventListener(cartCountEvent, updateCount);
  }, []);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="site-menu-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>
      {open ? (
        <>
          <button aria-label="Close menu" className="site-menu-backdrop" onClick={() => setOpen(false)} type="button" />
          <aside className="site-side-menu open" aria-hidden={false}>
            <div className="site-side-menu-head">
              <strong>Sunspark</strong>
              <button aria-label="Close menu" onClick={() => setOpen(false)} type="button">Close</button>
            </div>
            <nav aria-label="Mobile shop menu">
              <Link href="/#top" onClick={closeMenu}>Home</Link>
              <Link href="/store#top" onClick={closeMenu}>Store</Link>
              {categories.map((category) => (
                <Link href={`/category/${category.slug}#top`} key={category.slug} onClick={closeMenu}>
                  {category.name}
                </Link>
              ))}
              <Link className="side-action-link" href="/cart#top" onClick={closeMenu}>Cart <span>{currentCartCount}</span></Link>
              <Link className="side-action-link" href="/wishlist#top" onClick={closeMenu}>Wishlist</Link>
              <Link className="side-action-link" href="/account#top" onClick={closeMenu}>My Account</Link>
              {session ? (
                <form action={logoutAction}>
                  <button className="side-action-button" type="submit">Log out</button>
                </form>
              ) : (
                <Link className="side-action-link" href="/login#top" onClick={closeMenu}>Log in</Link>
              )}
            </nav>
          </aside>
        </>
      ) : null}
    </>
  );
}
