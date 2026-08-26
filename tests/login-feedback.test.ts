import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { loginErrorCode, loginErrorMessage } from "@/lib/auth/login-feedback";

/**
 * These three outcomes used to share one message. Telling a shop owner their password is
 * wrong during a database outage sends them to reset a credential that was never the
 * problem, so the distinction is worth holding onto.
 */
describe("login failure reasons", () => {
  it("calls a rejected password what it is", () => {
    expect(loginErrorCode(new ApiError("Invalid email or password.", 401))).toBe("invalid");
    expect(loginErrorCode(new ApiError("Bad request", 400))).toBe("invalid");
  });

  it("does not blame the password for a backend that is down or slow", () => {
    // 500 is what a database outage surfaces as; 504 is the storefront's own timeout.
    for (const status of [500, 502, 503, 504]) {
      expect(loginErrorCode(new ApiError("boom", status))).toBe("unavailable");
    }
  });

  it("treats a network failure as unavailable rather than crashing the page", () => {
    expect(loginErrorCode(new TypeError("fetch failed"))).toBe("unavailable");
    expect(loginErrorCode(undefined)).toBe("unavailable");
  });

  it("names rate limiting separately, since waiting is the fix", () => {
    expect(loginErrorCode(new ApiError("Too many requests", 429))).toBe("throttled");
  });

  it("says the credentials were not even checked when the server could not be reached", () => {
    expect(loginErrorMessage("unavailable")).toContain("not checked");
    expect(loginErrorMessage("invalid")).toBe("Invalid email or password.");
    // An unrecognised code in the query string must not render as blank or as a crash.
    expect(loginErrorMessage("nonsense")).toBe("Invalid email or password.");
    expect(loginErrorMessage(undefined)).toBe("Invalid email or password.");
  });
});
