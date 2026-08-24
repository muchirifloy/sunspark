import { describe, expect, it } from "vitest";
import { getImageUploadError } from "@/lib/uploads/product-images";

function fakeFile(name: string, type: string, size: number) {
  // File in jsdom cannot cheaply hold megabytes, so the size is stubbed.
  const file = new File([""], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const MB = 1024 * 1024;

describe("product image upload rules", () => {
  it("accepts a normal phone photo, which the old 2 MB cap rejected", () => {
    expect(getImageUploadError([fakeFile("photo.jpg", "image/jpeg", 5 * MB)])).toBeNull();
  });

  it("rejects a single image past the per-image limit", () => {
    expect(getImageUploadError([fakeFile("huge.jpg", "image/jpeg", 9 * MB)])).toMatch(/5 MB/);
  });

  it("rejects an unsupported type", () => {
    expect(getImageUploadError([fakeFile("scan.gif", "image/gif", 100)])).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects a batch that would overflow the Server Action body", () => {
    // Eight 5 MB images pass individually but are 40 MB together, which becomes
    // roughly 53 MB once base64 encoded.
    const files = Array.from({ length: 8 }, (_item, index) =>
      fakeFile(`p${index}.jpg`, "image/jpeg", 5 * MB)
    );

    expect(getImageUploadError(files)).toMatch(/smaller batches/);
  });

  it("allows a realistic multi-image gallery save", () => {
    const files = Array.from({ length: 4 }, (_item, index) =>
      fakeFile(`p${index}.jpg`, "image/jpeg", 5 * MB)
    );

    expect(getImageUploadError(files)).toBeNull();
  });

  it("ignores empty file inputs", () => {
    expect(getImageUploadError([fakeFile("", "", 0)])).toBeNull();
  });
});
