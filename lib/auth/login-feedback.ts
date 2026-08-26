import { ApiError } from "@/lib/api/client";

export const loginErrorCodes = ["invalid", "throttled", "unavailable"] as const;
export type LoginErrorCode = (typeof loginErrorCodes)[number];

/**
 * Tells apart "we rejected your password" from "we could not ask".
 *
 * These used to be the same message. A database outage answers 500, a slow backend
 * answers 504, and both were reported to the operator as "Invalid email or password" -
 * so the one person who could fix the outage was told their own password was wrong, and
 * would sit there retyping it. Only a 401 actually means the credentials were rejected.
 */
export function loginErrorCode(error: unknown): LoginErrorCode {
  if (!(error instanceof ApiError)) return "unavailable";
  // The API rate-limits sign-in attempts; that is neither a bad password nor an outage.
  if (error.status === 429) return "throttled";
  // 401 is the only status the login endpoint uses to reject credentials. 400 comes back
  // when the form itself was malformed, which the person can also fix by retyping.
  if (error.status === 401 || error.status === 400) return "invalid";
  return "unavailable";
}

export const loginErrorMessages: Record<LoginErrorCode, string> = {
  invalid: "Invalid email or password.",
  throttled: "Too many sign-in attempts. Wait a few minutes and try again.",
  unavailable: "We could not reach the server just now. Your details were not checked - please try again in a moment."
};

export function loginErrorMessage(code: string | undefined) {
  return loginErrorMessages[code as LoginErrorCode] ?? loginErrorMessages.invalid;
}
