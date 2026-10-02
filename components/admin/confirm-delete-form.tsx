"use client";

import { PendingButton } from "@/components/ui/pending-button";

/**
 * A delete button that will not fire on a single stray click. The confirm text
 * is written on the server, where the record's status is known, so the operator
 * reads the actual consequence -- whether stock comes back, what else changes --
 * before committing rather than a generic "are you sure?".
 */
export function ConfirmDeleteForm({
  action,
  className = "table-link danger-link",
  confirmMessage,
  label = "Delete",
  pendingLabel = "Deleting..."
}: {
  action: () => Promise<void>;
  className?: string;
  confirmMessage: string;
  label?: string;
  pendingLabel?: string;
}) {
  return (
    <form
      className="confirm-delete-form"
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <PendingButton className={className} pendingText={pendingLabel}>{label}</PendingButton>
    </form>
  );
}
