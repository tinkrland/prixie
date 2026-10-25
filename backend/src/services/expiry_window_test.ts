// expiry window tests: the words being said are the only source. a
// duration without an expiry cue is a schedule, not a window. a clock
// without a zone is quoted, never invented. every kind must carry the
// quote that produced it.

import { assertEquals } from "jsr:@std/assert@1";
import { extractExpiryWindow } from "./expiry_window.ts";

const NOW = new Date("2026-10-25T18:00:00.000Z");

Deno.test("explicit length: expires in 10 minutes", () => {
  const ew = extractExpiryWindow(
    "okay the code is PRIXIE10, it expires in 10 minutes so enter it now",
    { now: NOW },
  );
  assertEquals(ew?.kind, "minutes");
  assertEquals(ew?.minutes, 10);
  assertEquals(ew?.expiresAt, "2026-10-25T18:10:00.000Z");
  assertEquals(ew?.urgent, true);
  assertEquals(ew?.quote.includes("expires in 10 minutes"), true);
});

Deno.test("hours and halves: in half an hour, for 2 hrs", () => {
  const half = extractExpiryWindow("the link is valid for half an hour", { now: NOW });
  assertEquals(half?.minutes, 30);
  assertEquals(half?.expiresAt, "2026-10-25T18:30:00.000Z");

  const hrs = extractExpiryWindow("you've got 2 hrs before it expires, so redeem it", { now: NOW });
  assertEquals(hrs?.minutes, 120);
  assertEquals(hrs?.urgent, false);
});

Deno.test("a duration without an expiry cue is a schedule, not a window", () => {
  const ew = extractExpiryWindow("the next section starts in 10 minutes", { now: NOW });
  assertEquals(ew, null);
});

Deno.test("clock with a zone: expires at 3pm eastern", () => {
  // now = 14:00 edt. 3pm edt = 19:00 utc, one hour out
  const ew = extractExpiryWindow("the code expires at 3pm eastern", { now: NOW });
  assertEquals(ew?.kind, "clock");
  assertEquals(ew?.expiresAt, "2026-10-25T19:00:00.000Z");
  assertEquals(ew?.minutes, 60);
  assertEquals(ew?.urgent, true);
});

Deno.test("clock without a zone: quoted, never invented", () => {
  const ew = extractExpiryWindow("it expires at 3", { now: NOW });
  assertEquals(ew?.kind, "clock");
  assertEquals(ew?.expiresAt, undefined);
  assertEquals(ew?.minutes, undefined);
  assertEquals(ew?.quote, "it expires at 3");
});

Deno.test("meeting-bound window, length from the meeting end", () => {
  const ends = new Date("2026-10-25T18:45:00.000Z");
  const ew = extractExpiryWindow("the code only works during the meeting", {
    now: NOW,
    meetingEndsAt: ends,
  });
  assertEquals(ew?.kind, "meeting_end");
  assertEquals(ew?.minutes, 45);
  assertEquals(ew?.urgent, true);
});

Deno.test("meeting-bound window, no calendar end: kind and quote only", () => {
  const ew = extractExpiryWindow("it expires when the class ends", { now: NOW });
  assertEquals(ew?.kind, "meeting_end");
  assertEquals(ew?.minutes, undefined);
  assertEquals(ew?.quote, "it expires when the class ends");
});

Deno.test("today window: expires tonight", () => {
  const ew = extractExpiryWindow("this code expires tonight so use it soon", { now: NOW });
  assertEquals(ew?.kind, "today");
  assertEquals(ew?.minutes, undefined);
});

Deno.test("hurry words alone: urgency with no window", () => {
  const ew = extractExpiryWindow("hurry and grab it, first come first serve", { now: NOW });
  assertEquals(ew?.kind, "hurry");
  assertEquals(ew?.urgent, true);
});

Deno.test("nothing expiry-shaped is null, the common case", () => {
  assertEquals(extractExpiryWindow("the reading is chapter 9 by friday", { now: NOW }), null);
  assertEquals(extractExpiryWindow("", { now: NOW }), null);
});

Deno.test("explicit length beats a meeting-bound mention in the same breath", () => {
  const ew = extractExpiryWindow("the code expires in 15 minutes, before the meeting ends", {
    now: NOW,
    meetingEndsAt: new Date("2026-10-25T19:30:00.000Z"),
  });
  assertEquals(ew?.kind, "minutes");
  assertEquals(ew?.minutes, 15);
});
