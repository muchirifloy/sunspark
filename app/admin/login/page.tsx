import { redirect } from "next/navigation";
import { isAdminPath } from "@/lib/auth/next-path";

/**
 * The old separate admin sign-in, kept only as a forward to the single login.
 *
 * There is one login for everybody now: the role on the account decides whether it ends
 * in the storefront or the dashboard. This route survives because it is bookmarked, it
 * is in the README, and proxy.ts still names it - a 404 here would look like an outage
 * to whoever typed it.
 */
export default async function AdminLoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; next?: string; reset?: string }> }) {
  const params = await searchParams;
  // Only an admin path is carried across, and only after the same normalising the login
  // itself applies - this must not become an open redirect just because it is a forward.
  const requested = String(params?.next ?? "").split(String.fromCharCode(92)).join("/");
  const next = isAdminPath(requested) && !requested.startsWith("//") ? requested : "/admin";

  const query = new URLSearchParams({ next });
  if (params?.error) query.set("error", params.error);
  if (params?.reset) query.set("reset", params.reset);

  redirect(`/login?${query.toString()}`);
}
