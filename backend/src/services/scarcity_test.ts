// scarcity detection tests: the phrases that mean "act now" and the
// ones that do not. she must not escalate on ordinary speech.

import { assertEquals } from "jsr:@std/assert@1";
import { detectScarcity, scarcityKind } from "./scarcity.ts";

Deno.test("first come first serve, spoken casually", () => {
  const r = detectScarcity("okay so this code is first come first serve, just so you know");
  assertEquals(r.scarce, true);
  assertEquals(r.matched.includes("first come first serve"), true);
  assertEquals(scarcityKind(r), "time");
});

Deno.test("first N people extracts the cap", () => {
  const r = detectScarcity("the first 50 people to fill this form get access");
  assertEquals(r.scarce, true);
  assertEquals(r.cap, 50);
  assertEquals(scarcityKind(r), "people");
});

Deno.test("limited spots with only", () => {
  const r = detectScarcity("there are only 10 spots left in the cohort");
  assertEquals(r.scarce, true);
  assertEquals(r.cap, 10);
});

Deno.test("time-limited redemption window", () => {
  const r = detectScarcity("the code is only valid until the end of the class");
  assertEquals(r.scarce, true);
  assertEquals(scarcityKind(r), "time");
});

Deno.test("ordinary speech is not scarce", () => {
  assertEquals(detectScarcity("so today we are going to talk about kubernetes ingress").scarce, false);
  assertEquals(detectScarcity("the homework is due friday, submit it on the portal").scarce, false);
  assertEquals(detectScarcity("first, let me share my screen").scarce, false);
});

Deno.test("while supplies last and fcfs shorthand", () => {
  assertEquals(detectScarcity("codes available while supplies last").scarce, true);
  assertEquals(detectScarcity("it's fcfs so be quick").scarce, true);
});

// the owner's phrases (oct 25 2026): scarcity with no number in it. the
// words say the supply is short without saying how short, and she
// must hear that as urgency all the same.
Deno.test("limited so get yours quickly", () => {
  const r = detectScarcity("these are limited so get yours quickly");
  assertEquals(r.scarce, true);
  assertEquals(r.matched.includes("limited"), true);
  assertEquals(scarcityKind(r), "supply");
});

Deno.test("once they're out they're out", () => {
  const r = detectScarcity("once they're out they're out, no restock");
  assertEquals(r.scarce, true);
  assertEquals(r.matched.includes("once they're out"), true);
  assertEquals(scarcityKind(r), "supply");
});

Deno.test("we may not have enough", () => {
  const r = detectScarcity("heads up, we may not have enough for everyone today");
  assertEquals(r.scarce, true);
  assertEquals(r.matched.includes("may not have enough"), true);
  assertEquals(scarcityKind(r), "supply");
});

Deno.test("the close kin: run out, not enough to go around, before they're gone, while you can", () => {
  assertEquals(detectScarcity("these will run out fast").matched.includes("may run out"), true);
  assertEquals(detectScarcity("there might not be enough to go around").scarce, true);
  assertEquals(detectScarcity("grab one before they're all gone").scarce, true);
  assertEquals(detectScarcity("get them while you can").scarce, true);
});

Deno.test("limited time is the expiry side's word, not a supply claim", () => {
  // "limited time" is a clock question, and the bare-limited pattern
  // leaves it alone; the counted/noun forms keep their own labels
  const r = detectScarcity("this is a limited time offer");
  assertEquals(r.matched.includes("limited"), false);
  // but the counted form still reads the cap when the words give one
  const capped = detectScarcity("limited quantity, only 20 codes left");
  assertEquals(capped.matched.includes("limited quantity"), true);
  assertEquals(capped.cap, 20);
});

Deno.test("ordinary speech still is not scarce", () => {
  assertEquals(detectScarcity("the deadline for the essay is friday").scarce, false);
  assertEquals(detectScarcity("let me run out the door real quick, brb").scarce, false);
});
