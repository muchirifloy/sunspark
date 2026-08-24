import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;
const originalToken = process.env.API_ADMIN_TOKEN;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  vi.resetModules();
  process.env.API_ADMIN_TOKEN = "test-service-token";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.API_ADMIN_TOKEN = originalToken;
});

describe("customer order access", () => {
  it("asks the backend for the order scoped to the signed-in customer", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: "order-1", items: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getOrderInvoice } = await import("@/lib/invoices/invoice-service");
    await getOrderInvoice("order-1", { userId: "user-1", email: "buyer@example.com" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    // The owner must travel with the request; without it the backend would be
    // able to return anybody's order.
    expect(requestUrl.pathname).toBe("/orders/order-1");
    expect(requestUrl.searchParams.get("userId")).toBe("user-1");
    expect(requestUrl.searchParams.get("email")).toBe("buyer@example.com");
    expect(requestUrl.pathname.startsWith("/admin/")).toBe(false);
  });

  it("sends the service token so the backend can reject public callers", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: "order-1", items: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getOrderInvoice } = await import("@/lib/invoices/invoice-service");
    await getOrderInvoice("order-1", { userId: "user-1", email: "buyer@example.com" });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-sunspark-admin-token")).toBe("test-service-token");
  });

  it("escapes the order id instead of letting it walk the API path", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({}, 404));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getOrderInvoice } = await import("@/lib/invoices/invoice-service");
    await getOrderInvoice("../admin/products", { userId: "user-1", email: "buyer@example.com" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/orders/..%2Fadmin%2Fproducts");
  });

  it("returns null for an order the customer does not own", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ message: "Order not found." }, 404)) as unknown as typeof fetch;

    const { getOrderInvoice } = await import("@/lib/invoices/invoice-service");
    const order = await getOrderInvoice("someone-elses-order", {
      userId: "user-1",
      email: "buyer@example.com"
    });

    expect(order).toBeNull();
  });

  it("surfaces backend outages instead of quietly rendering nothing", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ message: "boom" }, 500)) as unknown as typeof fetch;

    const { getOrderInvoice } = await import("@/lib/invoices/invoice-service");
    await expect(
      getOrderInvoice("order-1", { userId: "user-1", email: "buyer@example.com" })
    ).rejects.toThrow();
  });
});
