import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-session-signing";
});

const user = { id: "u1", email: "buyer@example.com", name: "Buyer", role: "CUSTOMER" as const };

describe("session tokens", () => {
  it("accepts a freshly signed token", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/session");
    const now = 1_000_000;

    expect(verifySessionToken(createSessionToken(user, now), now + 60)).toEqual(user);
  });

  it("rejects a token past its signed expiry even if the cookie survived", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/session");
    const now = 1_000_000;
    const token = createSessionToken(user, now);

    expect(verifySessionToken(token, now + 60 * 60 * 2 + 1)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/session");
    const now = 1_000_000;
    const [, signature] = createSessionToken(user, now).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...user, role: "ADMIN", exp: now + 9999 }),
      "utf8"
    ).toString("base64url");

    expect(verifySessionToken(`${forged}.${signature}`, now)).toBeNull();
  });

  it("rejects a legacy token that carries no expiry", async () => {
    const { verifySessionToken } = await import("@/lib/auth/session");
    const { createHmac } = await import("node:crypto");
    const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
    const signature = createHmac("sha256", process.env.SESSION_SECRET as string)
      .update(payload)
      .digest("base64url");

    expect(verifySessionToken(`${payload}.${signature}`, 1_000_000)).toBeNull();
  });
});
