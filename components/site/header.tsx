import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/site/account-menu";
import { CartStatusLink } from "@/components/site/cart-status-link";
import { HeaderMenu } from "@/components/site/header-menu";
import { getCart } from "@/lib/cart/cart-service";
import { getStoreCategories } from "@/lib/products/queries";
import { clearSession, getSession } from "@/lib/auth/session";

async function customerLogoutAction() {
  "use server";

  await clearSession();
  redirect("/");
}

export async function Header() {
  const [cart, categories, session] = await Promise.all([getCart(), getStoreCategories(), getSession()]);
  const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const navItems = [
    { label: "Home", href: "/#top" },
    { label: "Store", href: "/store#top" },
    ...categories.slice(0, 5).map((category) => ({ label: category.name, href: `/category/${category.slug}#top` })),
    { label: "Account", href: "/account#top" }
  ];

  return (
    <header className="site-header" id="top">
      <nav aria-label="Main navigation" className="navigation">
        <div className="container nav-scroll">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <div className="main-header">
        <div className="container main-header-inner">
          <Link aria-label="Sunspark home" className="logo-link" href="/">
            <Image alt="Sunspark Electricals and Solar" height={293} priority src="/logo-header.webp" width={1100} />
          </Link>
          <form action="/store" className="header-search">
            <input aria-label="Search products" name="q" placeholder="Search products, hot deals..." />
            <button aria-label="Search products" type="submit">Search</button>
          </form>
          <nav aria-label="Shop actions" className="header-actions">
            <CartStatusLink initialCount={cartCount} />
            <Link aria-label="Wishlist" className="icon-link wishlist-link" href="/wishlist">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12 20s-7-4.4-9.4-8.3C.6 8.4 2.5 4.5 6.2 4.5c2 0 3.3 1 3.8 2 0.5-1 1.8-2 3.8-2 3.7 0 5.6 3.9 3.6 7.2C19 15.6 12 20 12 20Z" />
                </svg>
              </span>
              <strong>Wishlist</strong>
            </Link>
            <AccountMenu logoutAction={customerLogoutAction} session={session ? { name: session.name } : null} />
          </nav>
          <HeaderMenu
            cartCount={cartCount}
            categories={categories.map((category) => ({ name: category.name, slug: category.slug }))}
            logoutAction={customerLogoutAction}
            session={session ? { name: session.name } : null}
          />
        </div>
      </div>
    </header>
  );
}
