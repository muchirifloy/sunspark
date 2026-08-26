import { canUseBackOffice } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types";

/**
 * A post-login redirect target that cannot leave the site or exceed the role.
 *
 * `next` is the only part of signing in the browser controls, so it is the only part
 * that can be aimed somewhere it should not go. Two separate risks are handled here:
 * sending somebody off-site, and sending a customer into the dashboard.
 *
 * Rejecting "//" matters as much as rejecting "http://" - a protocol-relative URL is an
 * open redirect that reads like a path. Browsers also normalise backslashes into forward
 * slashes, so "/\evil.com" has to be folded before the check rather than after it, or it
 * arrives at the browser as "//evil.com".
 */
export function safeNext(value: string, role: UserRole | undefined) {
  const normalized = String(value ?? "").split(String.fromCharCode(92)).join("/");

  if (!normalized.startsWith("/") || normalized.startsWith("//")) return "";
  // Back-office paths are gated on the role here, again by requireAdmin on every admin
  // page, and again by the shared service token the browser never holds. This layer only
  // stops a pointless redirect; it is not what keeps the dashboard shut.
  if (isAdminPath(normalized) && !canUseBackOffice(role)) return "";

  return normalized;
}

export function isAdminPath(value: string) {
  return value === "/admin" || value.startsWith("/admin/") || value.startsWith("/admin?");
}
