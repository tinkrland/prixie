// form email strategy tests: plus tags, domain tags, and mode choice.
// no real addresses here either, only env-shaped fakes.

import { assertEquals } from "jsr:@std/assert@1";
import { plusAddress, tagFromUrl, chooseFormEmail } from "./form_email.ts";

Deno.test("plus address inserts a sanitized tag before the @", () => {
  assertEquals(plusAddress("prixie@example.com", "figma"), "prixie+figma@example.com");
  assertEquals(plusAddress("prixie@example.com", "Figma Design!"), "prixie+figmadesign@example.com");
  assertEquals(plusAddress("prixie@example.com", ""), "prixie@example.com");
  assertEquals(plusAddress("bad-no-at", "x"), "bad-no-at");
});

Deno.test("tag derives from the form's own domain", () => {
  assertEquals(tagFromUrl("https://www.figma.com/file/abc"), "figma");
  assertEquals(tagFromUrl("https://cdn.workshop.io/signup"), "workshop");
  assertEquals(tagFromUrl("https://shop.example.co.uk/offer"), "example");
  assertEquals(tagFromUrl("not a url"), "form");
});

Deno.test("plus is the default mode, regular and business come from env", async () => {
  Deno.env.delete("PRIXIE_FORM_EMAIL");
  Deno.env.delete("PRIXIE_BUSINESS_EMAIL");

  assertEquals(await chooseFormEmail("regular", "https://x.com"), null); // nothing configured
  assertEquals(await chooseFormEmail("business", "https://x.com"), null);

  Deno.env.set("PRIXIE_FORM_EMAIL", "prixie@example.com");
  try {
    const plus = await chooseFormEmail(null, "https://www.figma.com/file");
    assertEquals(plus?.mode, "plus");
    assertEquals(plus?.address, "prixie+figma@example.com");

    const regular = await chooseFormEmail("regular", "https://www.figma.com/file");
    assertEquals(regular?.address, "prixie@example.com");

    Deno.env.set("PRIXIE_BUSINESS_EMAIL", "prixie@business.example");
    const business = await chooseFormEmail("business", "https://www.figma.com/file");
    assertEquals(business?.mode, "business");
    assertEquals(business?.address, "prixie@business.example");
  } finally {
    Deno.env.delete("PRIXIE_FORM_EMAIL");
    Deno.env.delete("PRIXIE_BUSINESS_EMAIL");
  }
});
