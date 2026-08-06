import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
const requestedLimit = limitArgument ? Number(limitArgument.slice(8)) : 20;
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
  throw new Error("--limit must be a whole number between 1 and 100.");
}
const limit = requestedLimit;
const apiRoot = path.resolve(import.meta.dirname, "..");
const productDirectory = path.join(apiRoot, "public", "uploads", "products");
const backupsDirectory = path.join(apiRoot, "private-backups", "product-images");

await mkdir(productDirectory, { recursive: true });
await mkdir(backupsDirectory, { recursive: true });

const candidates = (await readdir(productDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp)$/i.test(entry.name));

const files = [];
for (const entry of candidates) {
  try {
    await stat(path.join(backupsDirectory, entry.name));
  } catch {
    files.push(entry);
  }

  if (files.length === limit) break;
}

let optimized = 0;
for (const entry of files) {
  const source = path.join(productDirectory, entry.name);
  const backup = path.join(backupsDirectory, entry.name);
  const extension = path.extname(entry.name).toLowerCase();
  const temporary = path.join(productDirectory, `.${entry.name}.${process.pid}.optimizing`);

  try {
    const image = sharp(source, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) {
      await copyFile(source, backup, 0);
      console.warn(`Skipped ${entry.name}: animated images are retained unchanged`);
      continue;
    }

    image.rotate();
    if (extension === ".png") await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(temporary);
    else if (extension === ".webp") await image.webp({ quality: 88, effort: 4 }).toFile(temporary);
    else await image.jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(temporary);

    const [sourceInfo, optimizedInfo] = await Promise.all([stat(source), stat(temporary)]);
    await copyFile(source, backup, 0);

    if (optimizedInfo.size < sourceInfo.size) {
      await rename(temporary, source);
      optimized += 1;
    } else {
      await rm(temporary, { force: true });
    }
  } catch (error) {
    await rm(temporary, { force: true });
    console.warn(`Skipped ${entry.name}:`, error instanceof Error ? error.message : "unknown error");
  }
}

console.log(`Product image optimization complete: ${optimized} optimized, ${files.length - optimized} retained or skipped.`);
