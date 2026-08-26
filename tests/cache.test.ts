import { describe, expect, it, vi } from "vitest";
import { cached, invalidate } from "../apps/api/src/cache";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The admin tab was slow because every visit recomputed figures that were expensive to
 * produce. These cover the part that makes it fast: after the first caller, nobody waits.
 */
describe("stale-while-revalidate cache", () => {
  it("computes once, then serves the stored value without calling again", async () => {
    const load = vi.fn().mockResolvedValue("first");

    expect(await cached("k:hit", 60_000, load)).toBe("first");
    expect(await cached("k:hit", 60_000, load)).toBe("first");
    expect(await cached("k:hit", 60_000, load)).toBe("first");
    expect(load).toHaveBeenCalledTimes(1);
  });

  // The point of the whole exercise: a stale read is answered immediately from the
  // previous value, and the recompute happens behind the caller rather than in front.
  it("answers instantly when stale and refreshes in the background", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce("old")
      .mockResolvedValueOnce("new");

    expect(await cached("k:stale", 0, load)).toBe("old");
    // Still the old value, returned without waiting, while the refresh is in flight.
    expect(await cached("k:stale", 0, load)).toBe("old");

    await tick();
    expect(await cached("k:stale", 60_000, load)).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good value when a refresh fails", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce("good")
      .mockRejectedValue(new Error("gateway down"));

    expect(await cached("k:fail", 0, load)).toBe("good");
    expect(await cached("k:fail", 0, load)).toBe("good");
    await tick();
    // A failed refresh must not replace a usable figure with an error or a blank.
    expect(await cached("k:fail", 60_000, load)).toBe("good");
  });

  it("recomputes after the value is invalidated by a send", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce("before")
      .mockResolvedValueOnce("after");

    expect(await cached("k:drop", 60_000, load)).toBe("before");
    invalidate("k:drop");
    expect(await cached("k:drop", 60_000, load)).toBe("after");
  });

  it("keeps separate keys apart", async () => {
    expect(await cached("k:a", 60_000, async () => "a")).toBe("a");
    expect(await cached("k:b", 60_000, async () => "b")).toBe("b");
    expect(await cached("k:a", 60_000, async () => "changed")).toBe("a");
  });
});
