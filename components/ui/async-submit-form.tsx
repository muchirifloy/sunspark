"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/result";

export function AsyncSubmitForm({
  action,
  buttonLabel,
  children,
  className,
  disabled = false,
  pendingLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  buttonLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <form className={className} onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setError("");
      startTransition(async () => {
        const result = await action(formData);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.redirectTo?.startsWith("/")) router.push(result.redirectTo);
        else if (result.redirectTo) window.location.assign(result.redirectTo);
      });
    }}>
      {children}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button aria-busy={isPending} className="primary-btn" disabled={disabled || isPending} type="submit">{isPending ? pendingLabel : buttonLabel}</button>
    </form>
  );
}
