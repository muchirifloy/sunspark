import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addSelectedToCartAction } from "@/app/cart/actions";
import { addWishlistAction } from "@/app/wishlist/actions";
import { ProductCard } from "@/components/site/product-card";
import { ProductGallery } from "@/components/site/product-gallery";
import { ProductOptionPurchase } from "@/components/site/product-option-purchase";
import { ProductShareButton } from "@/components/site/product-share-button";
import { PendingButton } from "@/components/ui/pending-button";
import { absoluteUrl, productUrl } from "@/lib/merchant/feed";
import { getPrimaryImage, publicImageUrl } from "@/lib/products/images";
import { getProductBySlugStrict, getProductCompanions, getRelatedProducts } from "@/lib/products/queries";
import { richTextToPlainText, sanitizeRichText } from "@/lib/products/rich-text";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugStrict(slug);

  if (!product) {
    return {};
  }

  const image = getPrimaryImage(product.images);
  const url = productUrl(product.slug);
  const shareImageUrl = `${url}/opengraph-image?v=2`;
  const description =
    product.seoDescription || product.shortDescription || richTextToPlainText(product.description) || `Buy ${product.name} from ${siteConfig.name}.`;

  return {
    title: product.seoTitle || product.name,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title: product.name,
      description,
      url,
      siteName: siteConfig.name,
      type: "website",
      images: [
        {
          url: shareImageUrl,
          width: 1200,
          height: 630,
          alt: `${product.name} at ${siteConfig.name}`
        },
        ...(image ? [{ url: absoluteUrl(publicImageUrl(image.url)), alt: product.name }] : [])
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [shareImageUrl]
    }
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlugStrict(slug);

  if (!product || !product.isActive) {
    notFound();
  }

  const [related, companions] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id),
    getProductCompanions(product.categoryId, product.id)
  ]);
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: {
      "@type": "Brand",
      name: product.brand || siteConfig.name
    },
    category: product.category.name,
    description: richTextToPlainText(product.description) || product.shortDescription || product.name,
    image: product.images.map((image) => absoluteUrl(publicImageUrl(image.url))),
    offers: {
      "@type": "Offer",
      url: productUrl(product.slug),
      priceCurrency: "KES",
      price: (product.priceCents / 100).toFixed(2),
      availability: `https://schema.org/${product.stockQuantity > 0 ? "InStock" : "OutOfStock"}`,
      itemCondition: "https://schema.org/NewCondition"
    }
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        type="application/ld+json"
      />
      <section className="section">
        <div className="container product-detail">
          <ProductGallery images={product.images} name={product.name} />
          <div className="product-summary">
            <p className="eyebrow">{product.category.name}</p>
            {product.brand ? <p className="product-brand">{product.brand}</p> : null}
            <h1>{product.name}</h1>
            <p className={product.stockQuantity > 0 ? "stock ok" : "stock out"}>
              {product.stockQuantity > 0 ? `${product.stockQuantity} available` : "Out of stock"}
            </p>
            <div className="hero-actions">
              <ProductOptionPurchase action={addSelectedToCartAction.bind(null, product.slug)} disabled={product.stockQuantity <= 0} options={product.options} />
              <form action={addWishlistAction.bind(null, product.slug)}>
                <PendingButton className="secondary-btn" pendingText="Saving...">Wishlist</PendingButton>
              </form>
              <ProductShareButton
                text={`Check this product from ${siteConfig.name}: ${product.name}`}
                title={product.name}
                url={productUrl(product.slug)}
              />
            </div>
          </div>
        </div>
      </section>
      <section className="section soft-section">
        <div className="container product-description">
          <h2>Product Details</h2>
          {product.description ? (
            <div className="product-rich-description" dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }} />
          ) : (
            <p>Contact Sunspark for specifications, availability, and installation guidance.</p>
          )}
        </div>
      </section>
      {related.length ? (
        <section className="section">
          <div className="container">
            <div className="section-heading">
              <h2>Related Products</h2>
            </div>
            <div className="product-grid">
              {related.map((item) => (
                <ProductCard product={item} key={item.id} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {companions.length ? (
        <section className="section soft-section">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Complete your setup</p>
              <h2>Often bought with</h2>
            </div>
            <div className="product-slider" aria-label="Often bought with">
              {companions.map((item) => <ProductCard product={item} key={item.id} />)}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
