// colloquial time tests: the prose forms people actually send.
// the anchor is fixed so "today/tomorrow" arithmetic is deterministic.

import { assertEquals } from "jsr:@std/assert";
import { parseColloquialTime } from "./colloquial_time.ts";

// wednesday, oct 21 2026, 3:00:00pm new york = 19:00 utc
const NOW = new Date("2026-10-21T19:00:00Z");

Deno.test("explicit clock + zone converts to utc correctly", () => {
  const t = parseColloquialTime("see you at 3pm est for the review", NOW);
  assertEquals(t?.iso, "2026-10-21T19:00:00.000Z"); // 3pm edt = 19:00 utc, and "now" IS 3pm et: same instant, no roll
  assertEquals(t?.partial, undefined);
});

Deno.test("tomorrow + time + zone crosses the date line inside the parser", () => {
  const t = parseColloquialTime("demo is tomorrow at 9am pt", NOW);
  assertEquals(t?.iso, "2026-10-22T16:00:00.000Z"); // 9am pdt = 16:00 utc
});

Deno.test("relative minutes: 'in 20 min' from now", () => {
  const t = parseColloquialTime("standup starts in 20 min", NOW);
  assertEquals(t?.iso, "2026-10-21T19:20:00.000Z");
});

Deno.test("relative hours: 'in an hour'", () => {
  const t = parseColloquialTime("call in an hour", NOW);
  assertEquals(t?.iso, "2026-10-21T20:00:00.000Z");
});

Deno.test("a time already passed today rolls to tomorrow", () => {
  const t = parseColloquialTime("join at 2pm est", NOW); // 2pm et already passed at 3pm et
  assertEquals(t?.iso?.startsWith("2026-10-22"), true);
});

Deno.test("time without a zone is an honest partial, not a guess", () => {
  const t = parseColloquialTime("meeting at 3:30pm", NOW);
  assertEquals(t?.partial, "time-no-zone");
  assertEquals(t?.iso, undefined);
});

Deno.test("a bare number is not a time: 'section 9' returns null", () => {
  assertEquals(parseColloquialTime("please review section 9 of the doc", NOW), null);
});

Deno.test("'at 5' with the at-marker reads as 5pm", () => {
  const t = parseColloquialTime("swing by at 5", NOW);
  assertEquals(t?.matched, "5"); // the clock match, not the preposition
  assertEquals(t?.partial, "time-no-zone");
});

Deno.test("24h clock converts: '14:30 ist'", () => {
  const t = parseColloquialTime("session at 14:30 ist", NOW);
  // 14:30 ist on oct 21 was 09:00 utc, before "now" (19:00 utc): the next
  // occurrence is oct 22's. the roll is decided in utc, not in local time.
  assertEquals(t?.iso, "2026-10-22T09:00:00.000Z");
});

Deno.test("plain text with no time in it returns null", () => {
  assertEquals(parseColloquialTime("just checking in, call me when you can", NOW), null);
});

Deno.test("explicit date without a clock time is a date partial", () => {
  const t = parseColloquialTime("the review is tomorrow", NOW);
  assertEquals(t?.partial, "date-no-time");
});
