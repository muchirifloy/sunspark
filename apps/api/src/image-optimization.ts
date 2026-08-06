import sharp from "sharp";

const optimizableImageTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function optimizeUploadedImage(bytes: Buffer, type: string): Promise<Buffer> {
  if (!optimizableImageTypes.has(type)) return bytes;

  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) {
      console.warn("Image optimization skipped", { reason: "animated-image" });
      return bytes;
    }

    image.rotate();
    const optimized = type === "image/png"
      ? await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : type === "image/webp"
        ? await image.webp({ quality: 88, effort: 4 }).toBuffer()
        : await image.jpeg({ quality: 88, progressive: true, mozjpeg: true }).toBuffer();

    return optimized.length < bytes.length ? optimized : bytes;
  } catch (error) {
    console.warn("Image optimization skipped", { name: error instanceof Error ? error.name : undefined });
    return bytes;
  }
}
