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
