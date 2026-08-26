import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/ui/pending-button";
import { PasswordField } from "@/components/ui/password-field";
import { apiFetch, ApiError } from "@/lib/api/client";
import { safeNext } from "@/lib/auth/next-path";
import { canUseBackOffice } from "@/lib/auth/roles";
import { setSession } from "@/lib/auth/session";
import type { PublicUser } from "@/lib/types";

/**
 * The single way into the site, for customers and staff alike.
 *
 * Where somebody lands is decided from the role the API returns after it has checked
 * the password - never from the form, the query string, or anything else the browser
 * controls. The only client-supplied part is `next`, and that is filtered against the
 * role below, so a customer cannot ask to be dropped inside the dashboard.
 */
async function loginAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const requested = String(formData.get("next") ?? "");
  let user: PublicUser;

  try {
    const result = await apiFetch<{ user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    user = result.user;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const carried = safeNext(requested, "CUSTOMER");
    redirect(`/login?error=invalid${carried ? `&next=${encodeURIComponent(carried)}` : ""}`);
  }

  await setSession({ id: user.id, email: user.email, name: user.name, role: user.role });

  // Staff to the dashboard, customers to the storefront. `next` only ever narrows this
  // to a specific page the role was already entitled to reach.
  const destination = safeNext(requested, user.role);
  redirect(destination || (canUseBackOffice(user.role) ? "/admin" : "/account"));
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; next?: string; reset?: string }> }) {
  const params = await searchParams;
  // Rendered before anyone has signed in, so the value is carried through the form at
  // its least privileged reading and re-checked against the real role after the login.
  const next = safeNext(params?.next ?? "", "CUSTOMER") || safeNext(params?.next ?? "", "ADMIN");

  return (
    <section className="section auth-section">
      <div className="auth-card">
        <div className="auth-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
          <span>Sunspark</span>
        </div>
        <h1>Sign in</h1>
        <p>One account for everything. Customers land in the store, staff land in the dashboard.</p>

        <form action={loginAction} className="stack-form">
          {next ? <input name="next" type="hidden" value={next} /> : null}
          <label>
            Email
            <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
          </label>
          <PasswordField autoComplete="current-password" />
          <PendingButton pendingText="Signing in...">Sign in</PendingButton>
        </form>

        {params?.error ? <p className="form-error" role="alert">Invalid email or password.</p> : null}
        {params?.reset ? <p className="form-success" role="status">Password updated. You can sign in now.</p> : null}

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/register">Create an account</Link>
        </div>
      </div>
    </section>
  );
}
