import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPrimaryImage, publicImageUrl } from "@/lib/products/images";
import { getProductBySlugStrict } from "@/lib/products/queries";
import { siteConfig } from "@/lib/site-config";

export const runtime = "nodejs";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

function price(cents: number) {
  return `KSH ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(cents / 100)}`;
}

async function safeImageDataUrl(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) return null;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) return null;
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function ProductOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlugStrict(slug);

  if (!product || !product.isActive) {
    notFound();
  }

  const image = getPrimaryImage(product.images);
  const imageUrl = image ? publicImageUrl(image.url) : `${siteConfig.url}/logo.jpg`;
  const safeImageUrl = await safeImageDataUrl(imageUrl);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#fff7ed",
          color: "#172033",
          fontFamily: "Arial, sans-serif",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: "100%",
            height: "455px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            overflow: "hidden"
          }}
        >
          {safeImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={product.name}
              src={safeImageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain"
              }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", color: "#0e52a4" }}>
              <div style={{ display: "flex", fontSize: 56, fontWeight: 900, letterSpacing: "2px" }}>SUNSPARK</div>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 700, color: "#f36f21" }}>Electricals & Solar</div>
            </div>
          )}
        </div>
        <div
          style={{
            width: "100%",
            height: "175px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "42px",
            padding: "26px 42px",
            borderTop: "8px solid #f36f21",
            background: "linear-gradient(115deg, #0e52a4 0%, #0b3f7e 72%, #f36f21 155%)",
            color: "#ffffff"
          }}
        >
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", fontSize: 20, fontWeight: 800, opacity: 0.9 }}>
              {siteConfig.name} · {product.category.name}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: product.name.length > 70 ? 31 : product.name.length > 45 ? 35 : 40,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: 0
              }}
            >
              {product.name}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" }}>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 900 }}>{price(product.priceCents)}</div>
              <div style={{ display: "flex", fontSize: 18, opacity: 0.88 }}>WhatsApp {siteConfig.phone}</div>
            </div>
            <div
              style={{
                display: "flex",
                borderRadius: 999,
                background: "#ffffff",
                color: "#0e52a4",
                padding: "13px 20px",
                fontSize: 20,
                fontWeight: 900
              }}
            >
              View product
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
