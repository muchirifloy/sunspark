import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/ui/pending-button";
import { apiFetch, ApiError } from "@/lib/api/client";

async function resetPasswordAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token || password.length < 8 || password !== confirmPassword) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`);
  }

  try {
    const result = await apiFetch<{ role?: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password })
    });
    if (result.role === "ADMIN" || result.role === "STAFF") {
      redirect("/login?reset=1");
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    redirect("/reset-password?error=expired");
  }

  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params?.token ?? "";

  return (
    <section className="section auth-section">
      <div className="auth-card">
        <h1>Choose New Password</h1>
        <p>Set a new password with at least 8 characters.</p>
        {params?.error === "expired" ? (
          <p className="form-error" role="alert">This reset link is invalid or has expired.</p>
        ) : null}
        {params?.error === "invalid" ? (
          <p className="form-error" role="alert">Passwords must match and be at least 8 characters.</p>
        ) : null}
        {token ? (
          <form action={resetPasswordAction} className="stack-form">
            <input name="token" type="hidden" value={token} />
            <label>
              New password
              <input name="password" type="password" minLength={8} required />
            </label>
            <label>
              Confirm password
              <input name="confirmPassword" type="password" minLength={8} required />
            </label>
            <PendingButton pendingText="Updating...">Update password</PendingButton>
          </form>
        ) : (
          <Link href="/forgot-password">Request a new reset link</Link>
        )}
      </div>
    </section>
  );
}
