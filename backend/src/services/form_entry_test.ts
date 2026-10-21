// redeem email shape tests: the receipt email must tell the owner exactly
// what she did on their behalf, or exactly what to do when she could not.

import { assertEquals } from "jsr:@std/assert@1";
import { buildRedeemEmail, getPrixieIdentity, CC_SELECTORS } from "./form_entry.ts";

Deno.test("successful redemption email carries both screenshots", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: true,
      filled_email: true,
      filled_name: true,
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
  assertEquals(email.body.includes("entered prixie's own form email and submitted"), true);
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
      cc_detected: true,
      detail: "credit card / payment field detected, not filling",
    },
    { meetingTitle: "webinar", captureTitle: "early bird ticket" },
  );

  assertEquals(email.subject, 'prixie: payment form, did NOT redeem "early bird ticket" (webinar)');
  assertEquals(email.body.includes("does not spend money"), true);
  assertEquals(email.body.includes("do it now: https://example.com/checkout"), true);
});

Deno.test("form identity is hers, not the owner's", () => {
  // unset everything, then set only the form identity
  Deno.env.delete("PRIXIE_FORM_EMAIL");
  assertEquals(getPrixieIdentity(), null);

  Deno.env.set("PRIXIE_FORM_EMAIL", "prixie-signups@example.com");
  try {
    const identity = getPrixieIdentity();
    assertEquals(identity?.email, "prixie-signups@example.com");
    assertEquals(identity?.name, "prixie"); // default name, changeable via env
  } finally {
    Deno.env.delete("PRIXIE_FORM_EMAIL");
  }
});

Deno.test("cc selectors target payment fields, not email fields", () => {
  // no cc selector TARGETS an email field as its primary match.
  // (the [type!="email"] exclusion in the card selector is the opposite:
  // it makes sure an email-typed field named "card..." does not trip it)
  for (const sel of CC_SELECTORS) {
    assertEquals(sel.includes('name*="email" i'), false, sel);
    assertEquals(sel.includes('id*="email" i'), false, sel);
    assertEquals(sel.includes('placeholder*="email" i'), false, sel);
    assertEquals(sel.includes('type="email"'), false, sel);
  }
  // and the strong signal is present
  assertEquals(CC_SELECTORS.includes('input[autocomplete="cc-number"]'), true);
});
