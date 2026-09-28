import Link from "next/link";
import { getStoreCategories } from "@/lib/products/queries";
import { siteConfig } from "@/lib/site-config";
import { formatWhatsAppDisplay, getStoreSettings } from "@/lib/settings";

export async function Footer() {
  const [categories, settings] = await Promise.all([getStoreCategories(), getStoreSettings()]);

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section>
          <h2>Sunspark Electrical and Solar</h2>
          <p><a className="footer-location" href={siteConfig.mapUrl} rel="noreferrer" target="_blank">{siteConfig.location}</a></p>
          <p>
            <a href={`https://wa.me/${settings.whatsappPhone}`}>WhatsApp {formatWhatsAppDisplay(settings.whatsappPhone)}</a>
          </p>
        </section>
        <section className="footer-links">
          <h2>Shop</h2>
          {categories.slice(0, 5).map((category) => (
            <Link href={`/category/${category.slug}#top`} key={category.id}>{category.name}</Link>
          ))}
          {!categories.length ? <Link href="/store#top">Store</Link> : null}
        </section>
        <section className="footer-links">
          <h2>Support</h2>
          <Link href="/account#top">My account</Link>
          <Link href="/checkout#top">Checkout</Link>
          <Link href="/policies#delivery">Delivery</Link>
          <Link href="/policies#privacy">Privacy</Link>
          <Link href="/policies#faq">FAQ</Link>
          <a href={siteConfig.facebookUrl}>Facebook</a>
        </section>
      </div>
      <div className="container footer-bottom">
        <span>Copyright 2026 Sunspark Electrical and Solar.</span>
      </div>
    </footer>
  );
}
