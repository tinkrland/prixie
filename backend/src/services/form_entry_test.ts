// redeem email shape tests: the receipt email must tell the owner exactly
// what she did on their behalf, or exactly what to do when she could not.

import { assertEquals } from "jsr:@std/assert@1";
import { buildRedeemEmail } from "./form_entry.ts";
import { CODE_SELECTORS } from "./promo.ts";

Deno.test("successful redemption email carries both screenshots", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: true,
      filled_email: true,
      filled_name: true,
      promo_attempted: false,
      promo_applied: false,
      cc_detected: false,
      before_screenshot: "https://cdn.example.com/before.png",
      after_screenshot: "https://cdn.example.com/after.png",
      detail: "submitted",
    },
    {
      meetingTitle: "hackathon kickoff",
      captureTitle: "the access code",
      scarce: "host: it is first come first serve",
    },
  );

  assertEquals(email.subject, 'prixie: redeemed "the access code" (hackathon kickoff)');
  assertEquals(email.body.includes("entered her form email and submitted"), true);
  assertEquals(email.body.includes("check that inbox"), true);
  assertEquals(email.body.includes("before.png"), true);
  assertEquals(email.body.includes("after.png"), true);
  assertEquals(email.body.includes("first come first serve"), true);
});

Deno.test("failed redemption email says act now and links the form", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: false,
      filled_email: false,
      filled_name: false,
      promo_attempted: false,
      promo_applied: false,
      cc_detected: false,
      detail: "no email field found on the page",
    },
    { meetingTitle: "hackathon kickoff", captureTitle: "the access code" },
  );

  assertEquals(email.subject.startsWith("prixie: could NOT redeem"), true);
  assertEquals(email.body.includes("do it now: https://example.com/claim"), true);
  assertEquals(email.body.includes("no email field found"), true);
});

Deno.test("cc form: she stops, does not redeem, tells the owner why", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/checkout",
      submitted: false,
      filled_email: false,
      filled_name: false,
      promo_attempted: false,
      promo_applied: false,
      cc_detected: true,
      detail: "credit card / payment field detected, not filling",
    },
    { meetingTitle: "webinar", captureTitle: "early bird ticket" },
  );

  assertEquals(email.subject, 'prixie: payment form, did NOT redeem "early bird ticket" (webinar)');
  assertEquals(email.body.includes("does not spend money"), true);
  assertEquals(email.body.includes("do it now: https://example.com/checkout"), true);
});

Deno.test("applied promo code is reported in the receipt email", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: true,
      filled_email: true,
      filled_name: true,
      promo_attempted: true,
      promo_applied: true,
      cc_detected: false,
      before_screenshot: "https://cdn.example.com/before.png",
      after_screenshot: "https://cdn.example.com/after.png",
      detail: "submitted",
    },
    { meetingTitle: "demo day", captureTitle: "the perk", formEmail: "prixie+example@fake.example", promoCode: "HACK50" },
  );
  assertEquals(email.body.includes("promo code HACK50: applied"), true);
  assertEquals(email.body.includes("prixie+example@fake.example"), true);
});

Deno.test("a code she could not enter is reported honestly", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: false,
      filled_email: false,
      filled_name: false,
      promo_attempted: true,
      promo_applied: false,
      cc_detected: false,
      detail: "no email field found on the page",
    },
    { meetingTitle: "demo day", captureTitle: "the perk", promoCode: "HACK50" },
  );
  assertEquals(email.body.includes("could not enter it"), true);
});

Deno.test("code selectors target code fields, never email or person-name fields", () => {
  for (const sel of CODE_SELECTORS) {
    assertEquals(sel.includes("email"), false, sel);
    assertEquals(sel.includes('*="name" i'), false, sel);
  }
});
