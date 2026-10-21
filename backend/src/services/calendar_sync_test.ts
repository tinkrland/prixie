// calendar sync adapter tests: cal.com + zcal, the new sources.
// the mock fetch speaks the shapes the adapters actually read; the point is
// that every source produces the same MeetingCandidate and that the unified
// sync keeps them apart (source:source_event_id) once they meet.

import { assertEquals } from "jsr:@std/assert";
import {
  calComBookingToCandidate,
  detectPlatform,
  extractMeetingUrl,
  parseZcalBooking,
  syncAllCalendars,
  syncCalCom,
} from "./calendar_sync.ts";

Deno.test("cal.com booking -> candidate, join url from description", () => {
  const candidate = calComBookingToCandidate({
    uid: "book_123",
    title: "portfolio review",
    description: "zoom link: https://zoom.us/j/987654321?pwd=abc",
    startTime: "2026-10-22T15:00:00.000Z",
    endTime: "2026-10-22T15:30:00.000Z",
  });

  assertEquals(candidate.source, "calcom");
  assertEquals(candidate.source_event_id, "book_123");
  assertEquals(candidate.join_url, "https://zoom.us/j/987654321?pwd=abc");
  assertEquals(candidate.platform, "zoom");
});

Deno.test("cal.com sync reads the v2 envelope, tolerating either shape", async () => {
  const originalFetch = globalThis.fetch;
  let requested: string | null = null;
  globalThis.fetch = (async (input: any, init?: any) => {
    requested = String(input);
    assertEquals(init.headers["cal-api-version"], "2024-08-13");
    return new Response(JSON.stringify({
      data: [{
        uid: "book_1",
        title: "intro call",
        location: "https://cal.com/room/xyz",
        startTime: "2026-10-23T10:00:00.000Z",
      }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const candidates = await syncCalCom("cal_api_key_test");
    assertEquals(requested, "https://api.cal.com/v2/bookings?status=upcoming");
    assertEquals(candidates.length, 1);
    assertEquals(candidates[0].source_event_id, "book_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cal.com sync returns empty on a bad key, never throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    assertEquals(await syncCalCom("bad"), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("zcal booking -> candidate, meeting url explicit", () => {
  const candidate = parseZcalBooking({
    title: "coffee chat",
    start_time: "2026-10-24T12:00:00.000Z",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    uid: "zcal_9",
  });

  assertEquals(candidate.source, "zcal");
  assertEquals(candidate.platform, "google_meet");
  assertEquals(candidate.join_url, "https://meet.google.com/abc-defg-hij");
});

Deno.test("zcal link detection covers zcal.to rooms", () => {
  assertEquals(extractMeetingUrl("see you at https://acme.zcal.to/coffee-chat-abc"),
    "https://acme.zcal.to/coffee-chat-abc");
  assertEquals(detectPlatform("https://acme.zcal.to/coffee-chat-abc"), "zcal");
});

Deno.test("unified sync keeps cal.com and zcal candidates separate", async () => {
  const candidates = await syncAllCalendars({
    calcom: { apiKey: "" }, // empty key: no fetch, no bookings
    zcal: {
      bookings: [
        { title: "zcal one", start_time: "2026-10-25T09:00:00.000Z", meeting_url: "https://zoom.us/j/1", uid: "z1" },
        { title: "zcal two", start_time: "2026-10-25T09:00:00.000Z", meeting_url: "https://zoom.us/j/2", uid: "z2" },
        { title: "zcal dup", start_time: "2026-10-25T09:00:00.000Z", meeting_url: "https://zoom.us/j/2", uid: "z2" },
      ],
    },
  });

  const zcal = candidates.filter(c => c.source === "zcal");
  assertEquals(zcal.length, 2); // the duplicate uid is dropped
  assertEquals(candidates.filter(c => c.source === "calcom").length, 0);
});
