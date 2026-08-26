import { describe, expect, it } from "vitest";
import { campaignDeliveryDestinations } from "../apps/api/src/messaging-recipients";

describe("campaign delivery destinations", () => {
  it("sends only one email when the same address appears with and without a phone", () => {
    const result = campaignDeliveryDestinations([
      { email: "customer@example.com", phone: null },
      { email: "CUSTOMER@example.com", phone: "254712345678" }
    ], "EMAIL");

    expect(result).toEqual({
      phones: [],
      emails: ["customer@example.com"],
      smsRecipientCount: 0,
      emailRecipientCount: 1,
      recipientCount: 1
    });
  });

  it("keeps distinct phones while deduplicating a shared email", () => {
    const result = campaignDeliveryDestinations([
      { email: "shared@example.com", phone: "254712345678" },
      { email: "shared@example.com", phone: "254723456789" }
    ], "SMS_AND_EMAIL");

    expect(result).toEqual({
      phones: ["254712345678", "254723456789"],
      emails: ["shared@example.com"],
      smsRecipientCount: 2,
      emailRecipientCount: 1,
      recipientCount: 3
    });
  });

  it("counts combined campaigns in the same delivery units as sent and failed totals", () => {
    const result = campaignDeliveryDestinations([
      { email: "one@example.com", phone: "254712345678" },
      { email: "two@example.com", phone: null }
    ], "SMS_AND_EMAIL");

    expect(result.phones).toHaveLength(1);
    expect(result.emails).toHaveLength(2);
    expect(result.smsRecipientCount).toBe(1);
    expect(result.emailRecipientCount).toBe(2);
    expect(result.recipientCount).toBe(3);
  });
});
