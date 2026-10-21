// redeem email shape tests: the receipt email must tell the owner exactly
// what she did on their behalf, or exactly what to do when she could not.

import { assertEquals } from "jsr:@std/assert@1";
import { buildRedeemEmail } from "./form_entry.ts";

Deno.test("successful redemption email carries both screenshots", () => {
  const email = buildRedeemEmail(
    {
      url: "https://example.com/claim",
      submitted: true,
      filled_email: true,
      filled_name: true,
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

  assertEquals(email.subject, 'prixie: redeemed "the access code" for you (hackathon kickoff)');
  assertEquals(email.body.includes("entered your details and submitted"), true);
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
      detail: "no email field found on the page",
    },
    { meetingTitle: "hackathon kickoff", captureTitle: "the access code" },
  );

  assertEquals(email.subject.startsWith("prixie: could NOT redeem"), true);
  assertEquals(email.body.includes("do it now: https://example.com/claim"), true);
  assertEquals(email.body.includes("no email field found"), true);
});
