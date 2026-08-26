import { describe, expect, it } from "vitest";
import { customerSummaries } from "../apps/api/src/customer-summaries";

describe("customerSummaries", () => {
  it("converts MariaDB bigint aggregates before Express serializes them", () => {
    const rows = customerSummaries([
      {
        id: "customer-1",
        name: "Test customer",
        email: "customer@example.com",
        phone: null,
        role: "CUSTOMER",
        createdAt: new Date("2026-08-26T08:00:00Z")
      }
    ], [
      { userId: "customer-1", orders: BigInt(3), spentCents: BigInt(125000) }
    ]);

    expect(rows[0]).toMatchObject({ orders: 3, spentCents: 125000 });
    expect(() => JSON.stringify(rows)).not.toThrow();
  });
});
