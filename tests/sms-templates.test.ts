import { describe, expect, it } from "vitest";
// The wording lives on the API side, but it is dependency-free by design so the exact
// text a customer receives can be asserted here without a database or a Celcom account.
import {
  composedSms,
  isTransactional,
  orderSms,
  senderIdFor,
  smsRecipient,
  smsRecipients,
  smsSegments,
  toGsm7,
  type SmsBrand
} from "../apps/api/src/sms-templates";
import { gsm7Length, smsSegments as clientSegments, toGsm7 as clientGsm7 } from "@/lib/sms/gsm7";

const brand: SmsBrand = { name: "Sunspark", phone: "0703586562", website: "sunsparkelectricals.co.ke" };

describe("recipient normalising", () => {
  it("accepts the forms a Kenyan customer actually types", () => {
    expect(smsRecipient("0712345678")).toBe("254712345678");
    expect(smsRecipient("+254 712 345 678")).toBe("254712345678");
    expect(smsRecipient("712345678")).toBe("254712345678");
    expect(smsRecipient("0112345678")).toBe("254112345678");
  });

  it("rejects anything that cannot receive a text", () => {
    expect(smsRecipient("0812345678")).toBeNull();
    expect(smsRecipient("07123456")).toBeNull();
    expect(smsRecipient("")).toBeNull();
    expect(smsRecipient(null)).toBeNull();
  });

  it("drops bad numbers from a bulk list rather than failing the send", () => {
    expect(smsRecipients(["0712345678", "not a phone", "+254712345678", "0798765432"]))
      .toEqual(["254712345678", "254798765432"]);
  });
});

describe("GSM-7 safety", () => {
  it("substitutes the punctuation a copy-paste introduces", () => {
    expect(toGsm7("Don’t miss it — 50% off…")).toBe("Don't miss it - 50% off...");
  });

  it("drops characters that would force the whole message into UCS-2", () => {
    expect(toGsm7("Great deal \u{1F600}")).toBe("Great deal");
  });

  it("counts a message over one segment as concatenated parts", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("")).toBe(0);
  });

  // A counter that trims as you type stalls on the space after a word and then jumps by
  // two on the next letter, which reads as a broken count. The composer keeps the pending
  // space so the number moves once per keystroke.
  it("advances by one per keystroke, including across a word break", () => {
    const typed = ["hello", "hello ", "hello w"];
    const counts = typed.map((entry) => gsm7Length(clientGsm7(entry, { preserveTrailingSpace: true })));
    expect(counts).toEqual([5, 6, 7]);
    // What actually goes out is still trimmed, and still matches the server.
    expect(clientGsm7("hello ")).toBe(toGsm7("hello "));
  });

  // The composer counts segments in the browser from its own copy of these tables. If
  // the two drift the operator is quoted a price the gateway does not charge.
  it("agrees with the browser-side counter used by the composer", () => {
    const samples = ["Hi there", "Don’t miss it — 50% off…", "a".repeat(200), "Great deal \u{1F600}"];
    for (const sample of samples) {
      expect(clientGsm7(sample)).toBe(toGsm7(sample));
      expect(clientSegments(toGsm7(sample))).toBe(smsSegments(toGsm7(sample)));
    }
  });
});

describe("order messages", () => {
  const context = { orderNumber: "SUN-12345678", customerName: "Grace Wanjiku", totalCents: 1250000 };

  it("names the shop, the order, and how to reach us", () => {
    const message = orderSms("ORDER_RECEIVED", brand, context);
    expect(message).toContain("Hi Grace");
    expect(message).toContain("SUN-12345678");
    expect(message).toContain("Call 0703586562");
    expect(message).toContain("sunsparkelectricals.co.ke");
  });

  it("keeps every transactional message inside one billed segment", () => {
    for (const purpose of ["ORDER_RECEIVED", "ORDER_PROCESSING", "ORDER_COMPLETED", "WALK_IN_SALE"] as const) {
      expect(smsSegments(orderSms(purpose, brand, context))).toBe(1);
    }
  });

  it("confirms the amount paid on a counter sale", () => {
    expect(orderSms("WALK_IN_SALE", brand, context)).toContain("KES 12,500");
  });

  it("does not greet a placeholder name as if it were a person", () => {
    const message = orderSms("WALK_IN_SALE", brand, { ...context, customerName: "Walk-in Customer" });
    expect(message).toContain("Hi there");
    expect(message).not.toContain("Walk");
  });
});

describe("sender ID routing", () => {
  it("treats everything except marketing as transactional", () => {
    expect(isTransactional("ORDER_RECEIVED")).toBe(true);
    expect(isTransactional("CUSTOMER_SERVICE")).toBe(true);
    expect(isTransactional("MARKETING")).toBe(false);
  });

  it("sends each kind under its own shortcode when both exist", () => {
    const ids = { transactionalSenderId: "SUNSPARK", promotionalSenderId: "SUNOFFERS" };
    expect(senderIdFor(ids, "ORDER_RECEIVED")).toBe("SUNSPARK");
    expect(senderIdFor(ids, "WALK_IN_SALE")).toBe("SUNSPARK");
    expect(senderIdFor(ids, "MARKETING")).toBe("SUNOFFERS");
  });

  // The rule that protects the shortcode: marketing under a transactional sender ID is
  // what gets it revoked, and that would take the order confirmations down with it.
  it("refuses to send marketing when only a transactional shortcode exists", () => {
    const ids = { transactionalSenderId: "SUNSPARK", promotionalSenderId: "" };
    expect(senderIdFor(ids, "MARKETING")).toBe("");
    expect(senderIdFor(ids, "ORDER_RECEIVED")).toBe("SUNSPARK");
  });

  it("does not borrow in the other direction either", () => {
    // Each kind reads its own variable and only its own, so a promotional shortcode
    // does not quietly start carrying order confirmations.
    const ids = { transactionalSenderId: "", promotionalSenderId: "SUNOFFERS" };
    expect(senderIdFor(ids, "ORDER_RECEIVED")).toBe("");
    expect(senderIdFor(ids, "MARKETING")).toBe("SUNOFFERS");
  });

  it("sends nothing at all when no shortcode is configured", () => {
    const ids = { transactionalSenderId: "", promotionalSenderId: "" };
    expect(senderIdFor(ids, "ORDER_RECEIVED")).toBe("");
    expect(senderIdFor(ids, "MARKETING")).toBe("");
  });
});

describe("composed messages", () => {
  it("signs off an admin-written message", () => {
    expect(composedSms("Solar panels are 20% off this week.", brand))
      .toBe("Solar panels are 20% off this week. Call 0703586562. sunsparkelectricals.co.ke");
  });

  it("does not repeat a signature the writer already included", () => {
    const written = "Shop the offer at sunsparkelectricals.co.ke";
    expect(composedSms(written, brand)).toBe(written);
  });

  it("returns nothing when the message was only unsupported characters", () => {
    expect(composedSms("\u{1F600}\u{1F600}", brand)).toBe("");
  });
});
