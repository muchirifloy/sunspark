import { afterEach, describe, expect, it, vi } from "vitest";

type StoredCookie = { value: string };

function mockCookieStore(initial?: string) {
  const store = new Map<string, StoredCookie>();
  if (initial !== undefined) store.set("sunspark_cart", { value: initial });

  return {
    store,
    api: {
      get: (name: string) => store.get(name),
      set: (name: string, value: string) => store.set(name, { value }),
      delete: (name: string) => store.delete(name)
    }
  };
}

async function loadCartService(initial?: string) {
  const cookies = mockCookieStore(initial);
  vi.doMock("next/headers", () => ({ cookies: async () => cookies.api }));
  vi.resetModules();
  const service = await import("@/lib/cart/cart-service");
  return { service, cookies };
}

function readCart(cookies: ReturnType<typeof mockCookieStore>) {
  return JSON.parse(cookies.store.get("sunspark_cart")?.value ?? "[]");
}

afterEach(() => {
  vi.doUnmock("next/headers");
  vi.resetModules();
});

describe("cart cookie rules", () => {
  it("refuses to grow past the line cap instead of bloating the cookie", async () => {
    const lines = Array.from({ length: 50 }, (_value, index) => ({
      slug: `product-${index}`,
      optionId: null,
      quantity: 1
    }));
    const { service, cookies } = await loadCartService(JSON.stringify(lines));

    await expect(service.addCartItem("one-too-many", 1)).rejects.toBeInstanceOf(service.CartLimitError);
    expect(readCart(cookies)).toHaveLength(50);
  });

  it("clamps a fractional or absurd quantity to a whole, sane number", async () => {
    const { service, cookies } = await loadCartService(
      JSON.stringify([{ slug: "cable", optionId: null, quantity: 1 }])
    );

    await service.updateCartItem("cable", 2.7);
    expect(readCart(cookies)[0].quantity).toBe(2);

    await service.updateCartItem("cable", 10_000_000);
    expect(readCart(cookies)[0].quantity).toBe(999);
  });

  it("edits only the targeted option line, not every line for that product", async () => {
    const { service, cookies } = await loadCartService(
      JSON.stringify([
        { slug: "cable", optionId: "opt-a", quantity: 1 },
        { slug: "cable", optionId: "opt-b", quantity: 5 }
      ])
    );

    await service.updateCartItem("cable", 3, "opt-a");

    const cart = readCart(cookies);
    expect(cart.find((item: { optionId: string }) => item.optionId === "opt-a").quantity).toBe(3);
    // The other option's quantity used to be overwritten by the loose matcher.
    expect(cart.find((item: { optionId: string }) => item.optionId === "opt-b").quantity).toBe(5);
  });

  it("drops a line when its quantity reaches zero", async () => {
    const { service, cookies } = await loadCartService(
      JSON.stringify([
        { slug: "cable", optionId: "opt-a", quantity: 1 },
        { slug: "breaker", optionId: null, quantity: 2 }
      ])
    );

    await service.updateCartItem("cable", 0, "opt-a");

    const cart = readCart(cookies);
    expect(cart).toHaveLength(1);
    expect(cart[0].slug).toBe("breaker");
  });

  it("ignores a corrupt cookie rather than throwing", async () => {
    const { service } = await loadCartService("not json at all");

    expect(await service.getCartItemCount()).toBe(0);
  });
});
