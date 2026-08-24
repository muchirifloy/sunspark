import sharp from "sharp";
import { env } from "./env.js";

const optimizableImageTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * Longest edge a stored product image is allowed to keep.
 *
 * The storefront never displays one larger than roughly 590 CSS px (the gallery
 * at 50vw inside a 1180px container), so 1600px still covers a 2x display.
 * Without this cap a 3000x3000 upload was stored at 3000x3000 and sent in full
 * to a ~300px product card, because image optimization is disabled at the
 * frontend and no srcset is generated.
 */
const maxDimension = Math.max(Number(env("IMAGE_MAX_DIMENSION", "1600")) || 1600, 200);

export async function optimizeUploadedImage(bytes: Buffer, type: string): Promise<Buffer> {
  if (!optimizableImageTypes.has(type)) return bytes;

  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) {
      console.warn("Image optimization skipped", { reason: "animated-image" });
      return bytes;
    }

    const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    const needsResize = longestEdge > maxDimension;

    image.rotate();

    if (needsResize) {
      image.resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
    }

    const optimized = type === "image/png"
      ? await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : type === "image/webp"
        ? await image.webp({ quality: 88, effort: 4 }).toBuffer()
        : await image.jpeg({ quality: 88, progressive: true, mozjpeg: true }).toBuffer();

    // A resized image is always preferable, even in the rare case where the
    // re-encode is not smaller in bytes - keeping the original would put the
    // oversized dimensions back. Only unresized images fall back on size.
    if (needsResize) return optimized;

    return optimized.length < bytes.length ? optimized : bytes;
  } catch (error) {
    console.warn("Image optimization skipped", { name: error instanceof Error ? error.name : undefined });
    return bytes;
  }
}
