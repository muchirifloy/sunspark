import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/ui/pending-button";
import { PasswordField } from "@/components/ui/password-field";
import { apiFetch, ApiError } from "@/lib/api/client";
import { setSession } from "@/lib/auth/session";
import type { PublicUser } from "@/lib/types";

async function loginAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeCustomerPath(String(formData.get("next") ?? ""));
  let user: PublicUser;

  try {
    const result = await apiFetch<{ user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    user = result.user;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    redirect(`/login?error=invalid${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  await setSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  if (user.role === "ADMIN" || user.role === "STAFF") {
    redirect("/admin");
  }

  redirect(next || "/account");
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; next?: string; reset?: string }> }) {
  const params = await searchParams;
  const next = safeCustomerPath(params?.next ?? "");
  return (
    <section className="section auth-section">
      <div className="auth-card">
        <h1>Customer Login</h1>
        <p>Sign in to manage orders, invoices, cart, and wishlist.</p>
        <form action={loginAction} className="stack-form">
          {next ? <input name="next" type="hidden" value={next} /> : null}
          <label>
            Email
            <input name="email" type="email" required />
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

function safeCustomerPath(value: string) {
  // Browsers normalise backslashes to forward slashes, so "/\evil.com" would
  // otherwise slip through as the protocol-relative "//evil.com".
  const normalized = value.split(String.fromCharCode(92)).join("/");

  if (!normalized.startsWith("/") || normalized.startsWith("//")) return "";
  if (normalized.startsWith("/admin")) return "";

  return normalized;
}
