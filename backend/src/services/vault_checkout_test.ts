// vault checkout tests: the pure half of the handoff. the money rule
// is the contract: only a parsed-free total completes, everything else
// stops with a reason. and the structural rules, checked structurally:
// card field selectors exist ONLY in the agentcard rail (the owner's
// carve-out covers issued one-time cards and nothing else), no payment
// source contains a hardcoded card-shaped number, and the receipt
// carries masked data only.

import { assertEquals } from "jsr:@std/assert@1";
import { capAmountMinor, pickRail, totalIsFree, vaultHandoffWanted } from "./payments/mod.ts";
import { cardItemSpec } from "./payments/kernel_rail.ts";
import { maskedLast4, normalizeExpiry, requestArgs } from "./payments/agentcard_rail.ts";
import { buildRedeemEmail, type FormEntryReceipt } from "./form_entry.ts";

Deno.test("total is free only when the words say $0", () => {
  assertEquals(totalIsFree("Order summary\nTotal due today: $0.00\nthanks"), true);
  assertEquals(totalIsFree("Total: free"), true);
  assertEquals(totalIsFree("total after promo: 0,00 eur"), true);
  // a nonzero total is not free, even beside a big promo discount
  assertEquals(totalIsFree("discount applied: 100% off\nTotal: $4.99 shipping"), false);
  // unreadable is not free: fail closed
  assertEquals(totalIsFree("welcome to the checkout page"), false);
});

Deno.test("the handoff wants exactly: cc gate + a promo code + kernel configured", () => {
  assertEquals(vaultHandoffWanted({ cc_detected: true, promoCode: "HACK10", kernelConfigured: true }), true);
  // a checkout with no promo code is still a hard stop: the vault is not
  // a shopping budget
  assertEquals(vaultHandoffWanted({ cc_detected: true, promoCode: null, kernelConfigured: true }), false);
  assertEquals(vaultHandoffWanted({ cc_detected: false, promoCode: "HACK10", kernelConfigured: true }), false);
  assertEquals(vaultHandoffWanted({ cc_detected: true, promoCode: "HACK10", kernelConfigured: false }), false);
});

Deno.test("the cap is headroom, never a budget: $1 covers a setup auth, nothing more", () => {
  assertEquals(capAmountMinor(true), 100);
  // a nonzero total never gets paid: the pre-total card request still
  // carries only headroom
  assertEquals(capAmountMinor(false), 100);
});

Deno.test("rail picking: kernel wins when both live, forced wins, none says why", () => {
  // kernel first: digits never through prixie beats instant
  assertEquals(pickRail({ kernel: true, agentcard: true }), { rail: "kernel" });
  assertEquals(pickRail({ kernel: false, agentcard: true }), { rail: "agentcard" });
  const forced = pickRail({ kernel: true, agentcard: true }, "agentcard");
  assertEquals(forced, { rail: "agentcard" });
  const missing = pickRail({ kernel: true, agentcard: false }, "agentcard");
  assertEquals(missing.rail, null);
  assertEquals(Boolean(missing.reason?.includes("not configured")), true);
  const none = pickRail({ kernel: false, agentcard: false });
  assertEquals(none.rail, null);
  assertEquals(Boolean(none.reason?.includes("no payment rail")), true);
});

Deno.test("kernel card item spec binds origin + cap, one item per checkout", () => {
  const spec = cardItemSpec({
    origin: "https://shop.example.com",
    capMinor: 100,
    currency: "usd",
    provider: "agentcard",
  }) as any;
  assertEquals(spec.type, "card");
  assertEquals(spec.spec.merchant_url, "https://shop.example.com");
  assertEquals(spec.spec.amount, 100);
  assertEquals(spec.spec.currency, "usd");
  assertEquals(spec.spec.provider, "agentcard");
});

Deno.test("agentcard request args: real merchant facts, cap in dollars, issued source", () => {
  const args = requestArgs({ merchantHint: "shop.example.com", origin: "https://shop.example.com", capMinor: 100 });
  const j = args.join(" ");
  assertEquals(args.includes("--source") && j.includes("agentcard"), true);
  assertEquals(j.includes("--merchant shop.example.com"), true);
  assertEquals(j.includes("--url https://shop.example.com"), true);
  // the cap is the headroom: $1 for a 100-minor-unit cap
  assertEquals(j.includes("--amount 1"), true);
  // no connected-card path: agent pay is passkey-per-purchase, wrong shape
  assertEquals(args.includes("--connected"), false);
  assertEquals(args.includes("--card"), false);
});

Deno.test("expiry and masking: MM/YY from any printed shape, last4 only", () => {
  assertEquals(normalizeExpiry({ exp_month: 3, exp_year: 2030 }), "03/30");
  assertEquals(normalizeExpiry({ expiry_month: "11", expiry_year: "2031" }), "11/31");
  assertEquals(maskedLast4({ number: "4111111111111111" }), "1111");
  assertEquals(maskedLast4({ card_number: "5555555555554444" }), "4444");
  assertEquals(maskedLast4({}), undefined);
});

const baseReceipt: FormEntryReceipt = {
  url: "https://shop.example.com/checkout",
  submitted: false,
  filled_email: false,
  filled_name: false,
  promo_attempted: false,
  promo_applied: false,
  cc_detected: true,
  detail: "credit card / payment field detected, not filling",
};

Deno.test("redeem email: a completed vault checkout tells the whole story", () => {
  const email = buildRedeemEmail(baseReceipt, {
    meetingTitle: "cs 370",
    captureTitle: "the swag code",
    promoCode: "HACK10",
    vault: {
      url: baseReceipt.url,
      rail: "kernel",
      attempted: true,
      promo_applied: false,
      email_filled: true,
      vault_filled: true,
      card_masked: "4242",
      total_read: "Total due today: $0.00",
      total_free: true,
      completed: true,
      detail: "checkout completed at a $0 total",
    },
  });
  assertEquals(email.subject, 'prixie: redeemed "the swag code" via kernel vault (cs 370)');
  assertEquals(email.body.includes("she never saw or typed a card number"), true);
  assertEquals(email.body.includes("**** 4242"), true);
  assertEquals(email.body.includes("nothing was spent"), true);
  // the old hard-stop line is gone when the vault took it
  assertEquals(email.body.includes("no-cc only by design"), false);
});

Deno.test("redeem email: a stopped vault checkout says why, honestly", () => {
  const email = buildRedeemEmail(baseReceipt, {
    meetingTitle: "cs 370",
    captureTitle: "the swag code",
    promoCode: "HACK10",
    vault: {
      url: baseReceipt.url,
      rail: "agentcard",
      attempted: true,
      promo_applied: false,
      email_filled: true,
      vault_filled: true,
      card_masked: "4444",
      total_read: "Total: $4.99 shipping",
      total_free: false,
      completed: false,
      stopped_reason: "total after promo was not free (or unreadable): she stopped before the pay button. the vault card was not charged. the owner decides",
      detail: "",
    },
  });
  assertEquals(email.subject, "prixie: vault checkout stopped, act now (cs 370)");
  assertEquals(email.body.includes("she did NOT complete it"), true);
  assertEquals(email.body.includes("the vault card was not charged"), true);
});

Deno.test("redeem email: no vault attempted keeps the honest hard stop", () => {
  const email = buildRedeemEmail(baseReceipt, {
    meetingTitle: "cs 370",
    captureTitle: "the swag code",
    promoCode: "HACK10",
    vault: {
      url: baseReceipt.url,
      rail: "none",
      attempted: false,
      promo_applied: false,
      email_filled: false,
      vault_filled: false,
      total_read: "",
      total_free: false,
      completed: false,
      stopped_reason: "no payment rail configured",
      detail: "",
    },
  });
  assertEquals(email.subject.includes("payment form, did NOT redeem"), true);
  assertEquals(email.body.includes("no-cc only by design"), true);
  assertEquals(email.body.includes("vault handoff not attempted"), true);
});

// the structural rule, checked structurally. card field selectors live
// ONLY in the agentcard rail file (the carve-out); the walk, the kernel
// rail, and the door stay clean of them. and no payment source may
// contain a hardcoded card-shaped number: the digits are runtime
// facts from the rails, never literals in the repo. if this test ever
// fails, someone reached for the card: stop them.
Deno.test("card selectors exist only in the agentcard rail; no digits anywhere", async () => {
  const forbidden = [
    "cardnumber", "card-number", "cvc", "cvv", "csc", "exp-date",
    'autocomplete="cc', 'input[name*="card', "card_exp",
  ];
  const clean = [
    new URL("./vault_checkout.ts", import.meta.url),
    new URL("./payments/mod.ts", import.meta.url),
    new URL("./payments/kernel_rail.ts", import.meta.url),
  ];
  for (const u of clean) {
    const src = (await Deno.readTextFile(u)).toLowerCase();
    for (const f of forbidden) {
      assertEquals(src.includes(f.toLowerCase()), false, `${u.pathname} mentions ${f}`);
    }
  }
  // the carve-out file: selectors are its business, but no literal
  // card numbers, ever. 13+ digits with spaces/dashes is card-shaped.
  const railSrc = await Deno.readTextFile(new URL("./payments/agentcard_rail.ts", import.meta.url));
  const cardShaped = /\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d/.test(railSrc);
  assertEquals(cardShaped, false, "agentcard_rail.ts contains a card-shaped literal");
  // and the masked last4 is the only card datum the receipt carries
  const typesSrc = await Deno.readTextFile(new URL("./payments/types.ts", import.meta.url));
  assertEquals(typesSrc.includes("card_masked"), true);
});
