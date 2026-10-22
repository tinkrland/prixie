// the join gate tests. the anchor times are fixed so the delay arithmetic
// is exact.

import { assertEquals } from "jsr:@std/assert";
import { shouldJoinNow } from "./join_trigger.ts";

const START = "2026-10-21T19:00:00Z"; // 3pm new york

Deno.test("delay trigger: joins after the delay window", () => {
  const at = new Date("2026-10-21T19:02:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "delay", join_after_participants: null }, at);
  assertEquals(d.join, true);
  assertEquals(d.reason, "2 min after start");
});

Deno.test("delay trigger: holds before the window", () => {
  const at = new Date("2026-10-21T18:59:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "delay", join_after_participants: null }, at);
  assertEquals(d.join, false);
  assertEquals(d.reason.includes("holding"), true);
});

Deno.test("participants trigger: joins when the count is reached", () => {
  const at = new Date("2026-10-21T19:05:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "participants", join_after_participants: 3 }, at, 3);
  assertEquals(d.join, true);
  assertEquals(d.reason, "3 participants present (needed 3)");
});

Deno.test("participants trigger: holds below the count", () => {
  const at = new Date("2026-10-21T19:05:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "participants", join_after_participants: 3 }, at, 2);
  assertEquals(d.join, false);
  assertEquals(d.reason, "holding: 2/3 participants present");
});

Deno.test("participants trigger: an unreadable count is a hold, never a guess", () => {
  const at = new Date("2026-10-21T19:05:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "participants", join_after_participants: 3 }, at, null);
  assertEquals(d.join, false);
  assertEquals(d.reason.includes("cannot see"), true);
});

Deno.test("participants trigger: holds before start even with people inside", () => {
  const at = new Date("2026-10-21T18:50:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "participants", join_after_participants: 2 }, at, 2);
  assertEquals(d.join, false);
});

Deno.test("misconfigured participants trigger falls back to delay, never joins blind", () => {
  const at = new Date("2026-10-21T19:02:00Z");
  const d = shouldJoinNow({ start_time: START, join_delay_minutes: 2, join_trigger: "participants", join_after_participants: null }, at);
  assertEquals(d.join, true); // the delay fallback window has passed
  assertEquals(d.reason.includes("falling back to delay"), true);
});

// room_open (the owner, oct 22 2026): the discord watcher's state is the
// fact, the schedule was a guess. a room with occupants dispatches.
Deno.test("room_open trigger: joins the moment the watched room is open", () => {
  const d = shouldJoinNow(
    { start_time: "2026-10-25T18:00:00.000Z", join_trigger: "room_open", join_delay_minutes: 2, join_after_participants: null },
    new Date("2026-10-22T03:00:00.000Z"),
    undefined,
    true,
  );
  assertEquals(d.join, true);
  assertEquals(d.reason, "the watched room's call is open: dispatching");
});

Deno.test("room_open trigger: a closed room is a hold, not a failure", () => {
  const d = shouldJoinNow(
    { start_time: "2026-10-22T18:00:00.000Z", join_trigger: "room_open", join_delay_minutes: 2, join_after_participants: null },
    new Date("2026-10-22T19:00:00.000Z"),
    undefined,
    false,
  );
  assertEquals(d.join, false);
});

Deno.test("room_open trigger: an unseen room is a hold, never a fake open", () => {
  const d = shouldJoinNow(
    { start_time: "2026-10-22T18:00:00.000Z", join_trigger: "room_open", join_delay_minutes: 2, join_after_participants: null },
    new Date("2026-10-22T19:00:00.000Z"),
    undefined,
    null,
  );
  assertEquals(d.join, false);
  assertEquals(d.reason, "holding: the watcher cannot see this room yet");
});
