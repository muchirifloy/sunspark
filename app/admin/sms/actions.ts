"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/auth/guards";

const basePath = "/admin/sms";

function back(view: string, params: Record<string, string>) {
  const search = new URLSearchParams({ view, ...params });
  return `${basePath}?${search.toString()}`;
}

/** Every failure comes back on the tab it happened on, with the reason attached. */
function failure(view: string, error: unknown): never {
  const message = error instanceof ApiError ? error.message : "The request could not be completed.";
  redirect(back(view, { error: "1", message }));
}

export async function refreshDeliveryReportsAction() {
  await requireAdmin(basePath);

  let result: { checked: number; updated: number };
  try {
    result = await apiFetch<{ checked: number; updated: number }>("/admin/messaging/refresh-reports", { method: "POST" });
  } catch (error) {
    failure("reports", error);
  }

  revalidatePath(basePath);
  redirect(back("reports", {
    notice: `Checked ${result.checked} message${result.checked === 1 ? "" : "s"}. ${result.updated} status${result.updated === 1 ? "" : "es"} updated.`
  }));
}

export async function sendSingleSmsAction(formData: FormData) {
  await requireAdmin(basePath);
  const to = String(formData.get("to") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "CUSTOMER_SERVICE");

  if (!to || !message) failure("single", new ApiError("Enter both a number and a message.", 400));

  let result: { segments: number; message: string };
  try {
    result = await apiFetch<{ segments: number; message: string }>("/admin/messaging/sms", {
      method: "POST",
      body: JSON.stringify({ to, message, purpose })
    });
  } catch (error) {
    failure("single", error);
  }

  revalidatePath(basePath);
  redirect(back("single", {
    notice: `Message sent to ${to} (${result.segments} segment${result.segments === 1 ? "" : "s"}).`
  }));
}

/**
 * Starts a bulk send.
 *
 * The API answers as soon as the campaign row exists rather than when the last message
 * lands, so this reports how many recipients it started on and sends the operator to
 * the reports tab, where the row updates as it runs.
 */
export async function sendCampaignAction(formData: FormData) {
  await requireAdmin(basePath);
  const channel = String(formData.get("channel") ?? "SMS");
  const view = channel === "EMAIL" ? "email" : "bulk";

  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    channel,
    subject: String(formData.get("subject") ?? "").trim(),
    heading: String(formData.get("heading") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
    buttonLabel: String(formData.get("buttonLabel") ?? "").trim(),
    buttonUrl: String(formData.get("buttonUrl") ?? "").trim(),
    sources: formData.getAll("sources").map(String),
    lookbackDays: Number(formData.get("lookbackDays") ?? 0) || 0,
    manual: String(formData.get("manual") ?? "").trim()
  };

  if (!payload.name || !payload.message) failure(view, new ApiError("Give the campaign a name and a message.", 400));

  let result: { recipientCount: number; smsRecipients: number; emailRecipients: number };
  try {
    result = await apiFetch<{ recipientCount: number; smsRecipients: number; emailRecipients: number }>("/admin/messaging/campaign", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    failure(view, error);
  }

  const parts = [
    result.smsRecipients ? `${result.smsRecipients} SMS` : "",
    result.emailRecipients ? `${result.emailRecipients} email${result.emailRecipients === 1 ? "" : "s"}` : ""
  ].filter(Boolean);

  revalidatePath(basePath);
  redirect(back("reports", {
    notice: `"${payload.name}" started: ${parts.join(" and ")}. Progress shows in the campaign list below.`
  }));
}
