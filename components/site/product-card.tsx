import Image from "next/image";
import Link from "next/link";
import { addToCartAction } from "@/app/cart/actions";
import { AddToCartButton } from "@/components/site/add-to-cart-button";
import { ProductCardSlideshow } from "@/components/site/product-card-slideshow";
import { formatMoney } from "@/lib/money";
import { getPrimaryImage, publicImageUrl } from "@/lib/products/images";
import { sellingUnitLabel } from "@/lib/products/units";
import type { SellingUnit } from "@/lib/types";

type ProductCardImage = {
  url: string;
  alt: string | null;
  isPrimary: boolean;
};

export type ProductCardProduct = {
  name: string;
  slug: string;
  shortDescription: string | null;
  priceCents: number;
  compareAtCents: number | null;
  sellingUnit: SellingUnit;
  stockQuantity: number;
  isHotDeal: boolean;
  images: ProductCardImage[];
  category: {
    name: string;
  };
};

export function ProductCard({ product }: { product: ProductCardProduct }) {
  const image = getPrimaryImage(product.images);
  const orderedImages = image
    ? [image, ...product.images.filter((item) => item !== image)]
    : product.images;

  return (
    <article className="product-card">
      <Link className="product-image" href={`/product/${product.slug}`}>
        {product.images.length > 1 ? (
          <ProductCardSlideshow
            images={orderedImages.map((item) => ({ alt: item.alt, url: publicImageUrl(item.url) }))}
          />
        ) : image ? (
          <Image src={publicImageUrl(image.url)} alt={image.alt ?? product.name} fill sizes="(max-width: 700px) 50vw, 25vw" />
        ) : (
          <span>No image</span>
        )}
        {product.isHotDeal ? <strong className="badge">Hot deal</strong> : null}
      </Link>
      <div className="product-body">
        <h2>
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h2>
        <div className="price-row">
          <strong>{formatMoney(product.priceCents)} <small>/{sellingUnitLabel(product.sellingUnit ?? "UNIT")}</small></strong>
          {product.compareAtCents ? <span>{formatMoney(product.compareAtCents)}</span> : null}
        </div>
        <small>{product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : "Out of stock"}</small>
        <div className="product-actions">
          <Link href={`/product/${product.slug}`}>View</Link>
          <AddToCartButton action={addToCartAction.bind(null, product.slug)} disabled={product.stockQuantity <= 0} />
        </div>
      </div>
    </article>
  );
}
