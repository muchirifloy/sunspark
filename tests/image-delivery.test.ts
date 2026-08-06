import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("image delivery", () => {
  it("serves backend-optimized images without the metered Next.js transformer", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
