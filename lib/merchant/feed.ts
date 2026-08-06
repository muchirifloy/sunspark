import { siteConfig } from "@/lib/site-config";
import { publicImageUrl } from "@/lib/products/images";
import { richTextToPlainText } from "@/lib/products/rich-text";

type MerchantImage = {
  url: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date | string;
};

export type MerchantProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  priceCents: number;
  stockQuantity: number;
  category: {
    name: string;
  };
  images: MerchantImage[];
};

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function absoluteUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, siteConfig.url).toString();
}

export function productUrl(slug: string) {
  return absoluteUrl(`/product/${slug}`);
}

function merchantPrice(priceCents: number) {
  return `${(priceCents / 100).toFixed(2)} KES`;
}

function productDescription(product: MerchantProduct) {
  return (
    richTextToPlainText(product.description) ||
    product.shortDescription?.trim() ||
    `${product.name} from ${siteConfig.name}.`
  ).slice(0, 5000);
}

export function buildMerchantFeed(products: MerchantProduct[]) {
  const updatedAt = new Date().toUTCString();
  const items = products.map((product) => {
    const images = [...product.images].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const primaryImage = images[0];
    const additionalImages = images.slice(1, 11);

    return `<item>
      <g:id>${xml(product.id)}</g:id>
      <g:title>${xml(product.name)}</g:title>
      <g:description>${xml(productDescription(product))}</g:description>
      <g:link>${xml(productUrl(product.slug))}</g:link>
      <g:canonical_link>${xml(productUrl(product.slug))}</g:canonical_link>
      ${primaryImage ? `<g:image_link>${xml(publicImageUrl(primaryImage.url))}</g:image_link>` : ""}
      ${additionalImages.map((image) => `<g:additional_image_link>${xml(publicImageUrl(image.url))}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${product.stockQuantity > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${merchantPrice(product.priceCents)}</g:price>
      <g:condition>new</g:condition>
      <g:brand>${xml(product.brand || siteConfig.name)}</g:brand>
      <g:product_type>${xml(product.category.name)}</g:product_type>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(siteConfig.name)}</title>
    <link>${xml(siteConfig.url)}</link>
    <description>${xml("Electricals, electronics, and solar products in Nairobi.")}</description>
    <lastBuildDate>${xml(updatedAt)}</lastBuildDate>
    ${items.join("\n    ")}
  </channel>
</rss>`;
}
