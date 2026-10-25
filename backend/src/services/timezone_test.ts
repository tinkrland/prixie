import { assertEquals } from "jsr:@std/assert@1";
import { convertToUTC } from "./timezone.ts";


// oct 21 2026: the old convertToUTC ignored sourceTz entirely and
// parsed in the server's zone, silently scheduling meetings hours off.
// these pin the fixed behavior, including the dst edge.
Deno.test("convertToUTC honors the source zone, not the server's", () => {
  // dates are PINNED, not "today": london fell back to gmt on oct 25
  // 2026 and an unpinned "today" version went stale that same morning.
  // 3pm edt on oct 21 = 19:00 utc (before the nov 1 dst flip)
  assertEquals(convertToUTC("2026-10-21 3:00 PM", "America/New_York"), "2026-10-21T19:00:00.000Z");
  // 10:30 ist on oct 21 = 05:00 utc (india has no dst, but pin anyway)
  assertEquals(convertToUTC("2026-10-21 10:30 am", "Asia/Kolkata"), "2026-10-21T05:00:00.000Z");
  // 9am london in bst (oct 21) = 08:00 utc; after the oct 25 flip = 09:00
  assertEquals(convertToUTC("2026-10-21 9:00", "Europe/London"), "2026-10-21T08:00:00.000Z");
  assertEquals(convertToUTC("2026-10-26 9:00", "Europe/London"), "2026-10-26T09:00:00.000Z");
});

Deno.test("dst is honored: the same clock time is a different instant either side of the flip", () => {
  // dst ends 2am nov 1 2026 in new york: 2:30pm is edt (utc-4) on oct 21,
  // est (utc-5) on nov 1
  assertEquals(convertToUTC("2026-10-21 2:30 PM", "America/New_York"), "2026-10-21T18:30:00.000Z");
  assertEquals(convertToUTC("2026-11-01 2:30 PM", "America/New_York"), "2026-11-01T19:30:00.000Z");
});

Deno.test("bad input fails honestly, never guesses a zone or time", () => {
  // unparseable time: returned as-is, callers must treat non-ISO as failure
  assertEquals(convertToUTC("whenever", "America/New_York"), "whenever");
  // unknown zone: same honest rule
  assertEquals(convertToUTC("3:00 PM", "Not/AZone"), "3:00 PM");
  // absolute times pass through untouched
  assertEquals(convertToUTC("2026-10-21T19:00:00Z", "America/New_York"), "2026-10-21T19:00:00.000Z");
});

// naive ISO with no offset is a wall clock in sourceTz, never the
// server's zone (oct 22 2026: the old shortcut swallowed it whole)
Deno.test("naive ISO datetime converts in the source zone", () => {
  assertEquals(convertToUTC("2026-11-01T14:30:00", "Asia/Kolkata"), "2026-11-01T09:00:00.000Z");
  assertEquals(convertToUTC("2026-11-01T14:30:00", "America/New_York"), "2026-11-01T19:30:00.000Z");
});
