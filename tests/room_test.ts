// room tests (the owner, oct 21 2026): the token mints are real jwt (verifiable
// grants), and the transport flow (connect under the existing identity,
// publish tts, subscribe for stt, close) is pinned with a fake factory.
// the rtc-node sdk itself is a transport leg: it is never faked as
// succeeding, and these tests never claim it loads.

import { assertRejects, assertEquals } from "jsr:@std/assert@1";

const ENV = {
  LIVEKIT_URL: "wss://prixie.test",
  LIVEKIT_API_KEY: "test-key",
  LIVEKIT_SECRET: "test-secret-that-is-long-enough",
};

async function importRoom() {
  // env at call time, so the module reads what we set here
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);
  return await import("../server/room.ts");
}

// decode a jwt payload without verifying it: tests assert what the mint
// CLAIMED, and the signature is livekit's business, not the test's
function jwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error(`not a jwt: ${parts.length} parts`);
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

Deno.test("sessionVoiceToken: minted for the session's own room and identity", async () => {
  const { sessionVoiceToken } = await importRoom();
  const jwt = await sessionVoiceToken({ sessionId: "s1", roomName: "call-42", identity: "prixie" });
  const payload = jwtPayload(jwt);
  const video = payload.video as Record<string, unknown>;
  assertEquals(payload.sub, "prixie"); // her identity in that room, not a new one
  assertEquals(video.room, "call-42"); // the session's own room
  assertEquals(video.roomJoin, true);
  assertEquals(video.canPublish, true); // her tts
  assertEquals(video.canSubscribe, true); // everyone else, for stt
});

Deno.test("createRoomToken: the only place a fresh identity is minted", async () => {
  const { createRoomToken } = await importRoom();
  const jwt = await createRoomToken({ roomName: "listen-line", participantName: "prixie voice" });
  const payload = jwtPayload(jwt);
  assertEquals(payload.sub, "prixie voice");
  assertEquals((payload.video as Record<string, unknown>).room, "listen-line");
});

Deno.test("speakInSession: connects under the session's own identity, no second knock", async () => {
  const { speakInSession } = await importRoom();
  let sawToken = "";
  let sawUrl = "";
  const room = await speakInSession(
    { sessionId: "s1", roomName: "call-42", identity: "prixie" },
    {
      connect: async (url, token) => {
        sawUrl = url;
        sawToken = token;
        return {
          publishTts: async () => {},
          onRemoteAudio: () => {},
          connected: () => true,
          close: async () => {},
        };
      },
    },
  );
  assertEquals(sawUrl, ENV.LIVEKIT_URL);
  assertEquals(jwtPayload(sawToken).sub, "prixie"); // the identity she already holds
  assertEquals(room.connected(), true);
});

Deno.test("joinRoom: standalone rooms mint a fresh identity and connect", async () => {
  const { joinRoom } = await importRoom();
  let sawToken = "";
  const room = await joinRoom(
    { roomName: "listen-line", participantName: "prixie voice" },
    {
      connect: async (_url, token) => {
        sawToken = token;
        return {
          publishTts: async () => {},
          onRemoteAudio: () => {},
          connected: () => true,
          close: async () => {},
        };
      },
    },
  );
  assertEquals(jwtPayload(sawToken).sub, "prixie voice");
  assertEquals(room.connected(), true);
});

Deno.test("the fake transport throws when the factory refuses: no fake success", async () => {
  const { speakInSession } = await importRoom();
  await assertRejects(
    () =>
      speakInSession(
        { sessionId: "s1", roomName: "call-42", identity: "prixie" },
        {
          connect: async () => {
            throw new Error("rtc-node could not load");
          },
        },
      ),
    Error,
    "rtc-node could not load",
  );
});

Deno.test("missing credentials error at the moment of use, honestly", async () => {
  // env is read at call time, so unset them AFTER the import: the mint
  // must refuse at the moment of use, not at load
  const { sessionVoiceToken } = await importRoom();
  Deno.env.set("LIVEKIT_API_KEY", "");
  Deno.env.set("LIVEKIT_SECRET", "");
  await assertRejects(
    () => sessionVoiceToken({ sessionId: "s1", roomName: "call-42", identity: "prixie" }),
    Error,
    "livekit credentials not configured",
  );
  // restore for the rest of the file
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);
});
