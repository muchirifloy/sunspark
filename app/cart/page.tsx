import { updateCartAction } from "@/app/cart/actions";
import { CartEditor } from "@/components/site/cart-editor";
import { getPrimaryImage, publicImageUrl } from "@/lib/products/images";
import { getCart } from "@/lib/cart/cart-service";
import { preventAdminShopping } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  await preventAdminShopping();
  const cart = await getCart();

  return (
    <section className="section">
      <div className="container">
        <CartEditor action={updateCartAction} initialItems={cart.items.map((item) => {
          const image = getPrimaryImage(item.product.images);
          return {
            imageAlt: image?.alt ?? item.product.name,
            imageUrl: image ? publicImageUrl(image.url) : null,
            key: `${item.product.id}-${item.cartOptionId ?? "default"}`,
            name: item.product.name,
            optionId: item.cartOptionId,
            optionLabel: item.option?.label ?? null,
            priceCents: item.option?.priceCents ?? item.product.priceCents,
            quantity: item.quantity,
            slug: item.product.slug,
            stockQuantity: item.product.stockQuantity,
          };
        })} />
      </div>
    </section>
  );
}
