// meeting identity + discord facts + recall: the surfaces declaring
// their platform and resolving who is in front of them.

import { assertEquals, assert } from "jsr:@std/assert@1.0.19";
import { meetingIdentity } from "./meeting_identity.ts";
import { hostReceiptLine } from "./memory_recall.ts";
import {
  annotateOccupant,
  noteOpenCalls,
  openChannelsFromState,
  resetSeenCallsForTests,
} from "./discord_memory.ts";
import type { Connection } from "./connections.ts";
import type { OpenVoiceChannel } from "./discord_watcher.ts";

const CONNS: Connection[] = [
  {
    id: "priya",
    label: "priya (the organizer)",
    owner: false,
    handles: { email: ["priya@example.com"], discord: ["900000000000000001", "priya.d"] },
  },
  {
    id: "owner",
    label: "the owner",
    owner: true,
    handles: { email: ["owner@example.com"], discord: ["700000000000000001"] },
  },
  {
    id: "dup-a",
    label: "dup a",
    owner: false,
    handles: { email: ["shared@example.com"] },
  },
  {
    id: "dup-b",
    label: "dup b",
    owner: false,
    handles: { email: ["shared@example.com"] },
  },
];

Deno.test("meeting identity: an email anchor recognizes the zoom row (email fallback)", () => {
  const id = meetingIdentity(
    { platform: "zoom", zoom_user_email: "priya@example.com", host_name: "Priya" },
    CONNS,
  );
  assertEquals(id.host_connection?.id, "priya");
  assertEquals(id.resolved_via, "email");
  assertEquals(id.scope.platform, "zoom");
  assertEquals(id.scope.connection_id, "priya");
});

Deno.test("meeting identity: a display name alone never anchors", () => {
  const id = meetingIdentity({ platform: "zoom", host_name: "Priya" }, CONNS);
  assertEquals(id.host_connection, null);
  assertEquals(id.scope.anchor, "stranger");
  assertEquals(id.host_email, null);
});

Deno.test("meeting identity: unknown email = honest stranger, no invented match", () => {
  const id = meetingIdentity(
    { platform: "google_meet", zoom_user_email: "someone@example.com" },
    CONNS,
  );
  assertEquals(id.host_connection, null);
  assertEquals(id.scope.anchor, "stranger");
  assertEquals(id.host_email, "someone@example.com");
});

Deno.test("meeting identity: an ambiguous email resolves to nobody, and says so", () => {
  const id = meetingIdentity({ platform: "zoom", zoom_user_email: "shared@example.com" }, CONNS);
  assertEquals(id.host_connection, null);
  assertEquals(id.scope.anchor, "ambiguous");
});

Deno.test("receipt lines: three honest states, silence without config", () => {
  assertEquals(
    hostReceiptLine({ platform: "zoom", zoom_user_email: "priya@example.com" }, CONNS),
    "who: priya (the organizer) (known through mail)",
  );
  assertEquals(
    hostReceiptLine({ platform: "zoom", zoom_user_email: "x@example.com" }, CONNS),
    "who: someone you have no anchor for yet",
  );
  assertEquals(
    hostReceiptLine({ platform: "zoom", zoom_user_email: "shared@example.com" }, CONNS),
    "who: an anchor held by more than one connection, so nobody was assumed",
  );
  // no config at all: say nothing rather than nag
  assertEquals(hostReceiptLine({ platform: "zoom", zoom_user_email: "x@example.com" }, []), null);
});

Deno.test("discord: occupants resolve by numeric id, names never anchor", () => {
  const named = annotateOccupant({ userId: "900000000000000001", name: "priya" }, CONNS);
  assertEquals(named.anchor, "anchored");
  assertEquals(named.connection_id, "priya");
  const owner = annotateOccupant({ userId: "700000000000000001", name: "anne-ish name" }, CONNS);
  assertEquals(owner.anchor, "owner");
  // a display name that equals a saved username but is a DIFFERENT id
  const stranger = annotateOccupant({ userId: "1234", name: "priya.d" }, CONNS);
  assertEquals(stranger.anchor, "stranger");
  assertEquals(stranger.connection_id, null);
});

Deno.test("discord: state -> open channels, empty channels are not calls", () => {
  const state = {
    voice: new Map([
      [
        "g1",
        new Map([
          ["900000000000000001", { channelId: "c1", name: "priya" }],
          ["5555", { channelId: "c1", name: "someone" }],
          ["7777", { channelId: null, name: "not-joined" }],
        ]),
      ],
    ]),
  };
  const open = openChannelsFromState(state);
  assertEquals(open.length, 1);
  assertEquals(open[0].channelId, "c1");
  assertEquals(open[0].occupants.length, 2);
});

Deno.test("discord facts: one fact per opened call, and a reopened call is new", async () => {
  resetSeenCallsForTests();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;
  Deno.env.set("PRIXIE_RETELLDB_URL", "http://head.test");
  try {
    const room: OpenVoiceChannel = {
      guildId: "g1",
      channelId: "c1",
      occupants: [{ userId: "700000000000000001", name: "owner" }],
    };
    const first = await noteOpenCalls([room], CONNS);
    assertEquals(first[0].ingested, true);
    assertEquals(calls, 1);
    // same open call, second pass: no second fact
    const second = await noteOpenCalls([room], CONNS);
    assertEquals(second.length, 0);
    assertEquals(calls, 1);
    // the room empties, then reopens: a new call is a new fact
    await noteOpenCalls([], CONNS);
    const third = await noteOpenCalls([room], CONNS);
    assertEquals(third[0].ingested, true);
    assertEquals(calls, 2);
    // a room with no anchored owner writes nothing
    const strangersOnly: OpenVoiceChannel = {
      guildId: "g2",
      channelId: "c9",
      occupants: [{ userId: "1234", name: null }],
    };
    const fourth = await noteOpenCalls([strangersOnly], CONNS);
    assertEquals(fourth[0].ingested, false);
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("PRIXIE_RETELLDB_URL");
    resetSeenCallsForTests();
  }
});
