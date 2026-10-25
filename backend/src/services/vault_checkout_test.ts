// vault checkout tests: the pure half of the handoff. the money rule is
// the contract: only a parsed-free total completes, everything else
// stops with a reason. and the structural rule: no card selector or
// card-shaped value ever exists in the handoff code, because the card
// is the vault's, never prixie's.

import { assertEquals } from "jsr:@std/assert@1";
import { pickVaultCard, totalIsFree, vaultHandoffWanted } from "./vault_checkout.ts";
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

Deno.test("pickVaultCard: env names win, else first vault with a card", () => {
  const cards = { "the owner-vault": [{ key: "buffer_card", type: "card", masked_last4: "4242" }] };
  const env = pickVaultCard(["the owner-vault"], cards, "the owner-vault", "buffer_card");
  assertEquals(env?.card.key, "buffer_card");
  const fallback = pickVaultCard(["the owner-vault"], cards, undefined, undefined);
  assertEquals(fallback?.vault, "the owner-vault");
  assertEquals(pickVaultCard(["other"], {}, undefined, undefined), null);
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
      attempted: true,
      promo_applied: false,
      email_filled: true,
      vault_filled: true,
      card_masked: "4242",
      total_read: "Total due today: $0.00",
      total_free: true,
      completed: true,
      detail: "vault checkout completed at a $0 total",
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
      attempted: true,
      promo_applied: false,
      email_filled: true,
      vault_filled: true,
      card_masked: "4242",
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
    vault: {
      url: baseReceipt.url,
      attempted: false,
      promo_applied: false,
      email_filled: false,
      vault_filled: false,
      total_read: "",
      total_free: false,
      completed: false,
      stopped_reason: "no vault card configured: the owner's buffer card is not enrolled in kernel yet",
      detail: "",
    },
  });
  assertEquals(email.subject.includes("payment form, did NOT redeem"), true);
  assertEquals(email.body.includes("no-cc only by design"), true);
  assertEquals(email.body.includes("vault handoff not attempted"), true);
});

// the structural rule, checked structurally: the handoff source contains
// no card field selector and no card-digit handling, because the card
// portion is kernel's vault fill, not prixie's typing. if this test ever
// fails, someone reached for the card: stop them.
Deno.test("the handoff code never touches card selectors or digits", async () => {
  const src = await Deno.readTextFile(new URL("./vault_checkout.ts", import.meta.url));
  const forbidden = [
    "cardnumber", "card-number", "cvc", "cvv", "csc", "exp-date",
    "autocomplete=\"cc", "input[name*=\"card", "card_exp",
  ];
  for (const f of forbidden) {
    assertEquals(src.toLowerCase().includes(f.toLowerCase()), false, `vault_checkout.ts mentions ${f}`);
  }
  // and the masked last4 is the only card datum the receipt may carry
  assertEquals(src.includes("masked_last4"), true);
});
