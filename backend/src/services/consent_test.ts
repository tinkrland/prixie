// consent policy tests (the owner, oct 22 2026): she never ever accepts
// non-essential cookies and never ever opts into newsletters. these pin
// the pure halves: consentChoice (which button, if any) and
// newsletterOptIn (what smells like an opt-in). the engine half rides
// navigateTo and enterForm and is deliberately thin around these.

import { assertEquals } from "jsr:@std/assert";
import { consentChoice, newsletterOptIn, newsletterDirection } from "./consent.ts";

Deno.test("consentChoice: reject all wins, before anything else", () => {
  const c = consentChoice(["Accept all", "Reject all", "Manage preferences"]);
  assertEquals(c.action, "click");
  assertEquals(c.label, "Reject all");
});

Deno.test("consentChoice: only-necessary is the second pick", () => {
  const c = consentChoice(["Accept all", "Only necessary cookies"]);
  assertEquals(c.action, "click");
  assertEquals(c.label, "Only necessary cookies");
});

Deno.test("consentChoice: onetrust's shapes are known", () => {
  assertEquals(consentChoice(["Accept All Cookies", "Reject All", "Cookies Settings"]).label, "Reject All");
  // onetrust's necessary-only path
  assertEquals(consentChoice(["Accept All Cookies", "Confirm My Choices"]).action, "click");
});

Deno.test("consentChoice: accept-only banners get NO click, ever", () => {
  const c = consentChoice(["Accept all"]);
  assertEquals(c.action, "none");
  // even the friendliest wording
  assertEquals(consentChoice(["Accept", "Got it"]).action, "none");
});

Deno.test("consentChoice: a close button beats an accept-all, but loses to reject", () => {
  assertEquals(consentChoice(["Accept all", "Close"]).label, "Close");
  assertEquals(consentChoice(["Reject", "Close"]).label, "Reject");
});

Deno.test("consentChoice: an empty or shouty label is ignored", () => {
  assertEquals(consentChoice(["", "   ", "a very long button label that rambles past the sixty character limit for sure"]).action, "none");
});

Deno.test("consentChoice: nothing offered is nothing clicked", () => {
  assertEquals(consentChoice([]).action, "none");
});

Deno.test("newsletterOptIn: the common opt-in smells are caught", () => {
  assertEquals(newsletterOptIn("Subscribe to our newsletter"), true);
  assertEquals(newsletterOptIn("email_updates"), true);
  assertEquals(newsletterOptIn("I want marketing emails"), true);
  assertEquals(newsletterOptIn("opt-in for product updates"), true);
  assertEquals(newsletterOptIn("JOIN OUR MAILING LIST"), true);
});

Deno.test("newsletterOptIn: ordinary form fields are left alone", () => {
  assertEquals(newsletterOptIn("first_name"), false);
  assertEquals(newsletterOptIn("attendance"), false);
  assertEquals(newsletterOptIn(""), false);
});

Deno.test("newsletterDirection: tick-to-NOT-be-added boxes are the ones she clicks", () => {
  assertEquals(newsletterDirection("Tick this box if you do NOT wish to receive our newsletter"), "opt_out");
  assertEquals(newsletterDirection("tick here to not be added to the mailing list"), "opt_out");
  assertEquals(newsletterDirection("unsubscribe from marketing emails"), "opt_out");
  assertEquals(newsletterDirection("I would rather not receive product updates"), "opt_out");
  assertEquals(newsletterDirection("newsletter_opt_out"), "opt_out");
});

Deno.test("newsletterDirection: plain subscribe boxes are opt-in, never hers", () => {
  assertEquals(newsletterDirection("Subscribe to our newsletter"), "opt_in");
  assertEquals(newsletterDirection("I want marketing emails"), "opt_in");
  assertEquals(newsletterDirection("Join our mailing list"), "opt_in");
});

Deno.test("newsletterDirection: ordinary fields are none of her business", () => {
  assertEquals(newsletterDirection("first_name"), "none");
  assertEquals(newsletterDirection(""), "none");
});
