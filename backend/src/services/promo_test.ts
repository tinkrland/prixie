// promo extraction tests: hosts say "use HACK50", she hears the token.
// she never invents one, and ordinary speech yields nothing.

import { assertEquals } from "jsr:@std/assert@1";
import { extractPromoCode } from "./promo.ts";

Deno.test("explicit code phrasings", () => {
  assertEquals(extractPromoCode("use code HACK50 for 20% off"), "HACK50");
  assertEquals(extractPromoCode("the promo code is: BUILD10"), "BUILD10");
  assertEquals(extractPromoCode("discount code FALL24 at checkout"), "FALL24");
  assertEquals(extractPromoCode("everyone go to the site and use BUILDME"), "BUILDME");
});

Deno.test("a bare caps token with a digit is a code candidate", () => {
  assertEquals(extractPromoCode("so yeah just enter WIN22 on the portal"), "WIN22");
});

Deno.test("ordinary speech yields no code", () => {
  assertEquals(extractPromoCode("so today we are going to talk about kubernetes"), null);
  assertEquals(extractPromoCode("the k8s cluster is up"), null);
  assertEquals(extractPromoCode("here is the form link"), null);
  assertEquals(extractPromoCode("ok the code will be sent after class"), null);
});
