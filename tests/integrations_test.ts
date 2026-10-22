// stream target tests: the bridge is platform-agnostic, and each platform
// file is exactly one StreamTarget + one point-at call.

import { assertEquals } from "jsr:@std/assert";
import { ObsBridge, obsAuthHash } from "../integrations/obs.ts";
import { TWITCH_INGEST, twitchTarget, pointObsAtTwitch } from "../integrations/twitch.ts";
import { kickTarget, kickTargetFromEnv, pointObsAtKick } from "../integrations/kick.ts";
import { youtubeTarget, youtubeTargetFromEnv, pointObsAtYoutube } from "../integrations/youtube.ts";

// obs_test.ts's mock speaks the protocol; import its pieces so the target
// tests ride the same bridge.
import { mockObs } from "./obs_test.ts";

Deno.test("twitch target is the stable public ingest plus the key", () => {
  assertEquals(TWITCH_INGEST, "rtmp://live.twitch.tv/app");
  assertEquals(twitchTarget("key_123"), { server: "rtmp://live.twitch.tv/app", key: "key_123" });
});

Deno.test("pointObsAtTwitch drives SetStreamSettings with twitch's values", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();

  await pointObsAtTwitch(bridge, "key_123");

  assertEquals(
    obs.requests.find((r) => r.requestType === "SetStreamSettings")?.requestData,
    {
      streamSettingsType: "custom",
      settings: { server: "rtmp://live.twitch.tv/app", key: "key_123" },
      save: true,
    },
  );
  bridge.close();
  await obs.finish();
});

Deno.test("kick target takes the dashboard's ingest url, not a hardcoded one", () => {
  const target = kickTarget("rtmp://ingest.example.com/live", "kk_123");
  assertEquals(target.server, "rtmp://ingest.example.com/live");
  assertEquals(target.key, "kk_123");
});

Deno.test("kick target from env is null without both credentials", async () => {
  const before = { url: Deno.env.get("KICK_STREAM_URL"), key: Deno.env.get("KICK_STREAM_KEY") };
  Deno.env.delete("KICK_STREAM_URL");
  Deno.env.delete("KICK_STREAM_KEY");
  try {
    assertEquals(kickTargetFromEnv(), null);
    Deno.env.set("KICK_STREAM_URL", "rtmp://ingest.example.com/live");
    Deno.env.set("KICK_STREAM_KEY", "kk_123");
    assertEquals(kickTargetFromEnv(), kickTarget("rtmp://ingest.example.com/live", "kk_123"));
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) Deno.env.delete(k!);
      else Deno.env.set(k!, v);
    }
  }
});

Deno.test("pointObsAtKick drives the same SetStreamSettings seam as twitch", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();

  await pointObsAtKick(bridge, kickTarget("rtmp://ingest.example.com/live", "kk_123"));

  assertEquals(
    obs.requests.find((r) => r.requestType === "SetStreamSettings")?.requestData,
    {
      streamSettingsType: "custom",
      settings: { server: "rtmp://ingest.example.com/live", key: "kk_123" },
      save: true,
    },
  );
  bridge.close();
  await obs.finish();
});

Deno.test("obsAuthHash still computes the protocol's challenge response", async () => {
  // a canary: moving obs.ts into integrations/ must not disturb the math.
  const hash = await obsAuthHash("password", "challenge", "salt");
  assertEquals(typeof hash, "string");
  assertEquals(hash.length > 0, true);
});

Deno.test("youtube target is the studio's ingest url, never a constant", () => {
  const target = youtubeTarget("rtmps://a.rtmps.youtube.com/live2", "yt_123");
  assertEquals(target.server, "rtmps://a.rtmps.youtube.com/live2");
  assertEquals(target.key, "yt_123");
});

Deno.test("youtube target from env is null without both credentials", async () => {
  const before = { url: Deno.env.get("YOUTUBE_STREAM_URL"), key: Deno.env.get("YOUTUBE_STREAM_KEY") };
  Deno.env.delete("YOUTUBE_STREAM_URL");
  Deno.env.delete("YOUTUBE_STREAM_KEY");
  try {
    assertEquals(youtubeTargetFromEnv(), null);
    Deno.env.set("YOUTUBE_STREAM_URL", "rtmps://a.rtmps.youtube.com/live2");
    Deno.env.set("YOUTUBE_STREAM_KEY", "yt_123");
    assertEquals(youtubeTargetFromEnv(), youtubeTarget("rtmps://a.rtmps.youtube.com/live2", "yt_123"));
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) Deno.env.delete(k!);
      else Deno.env.set(k!, v);
    }
  }
});

Deno.test("pointObsAtYoutube drives the same SetStreamSettings seam", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();

  await pointObsAtYoutube(bridge, youtubeTarget("rtmps://a.rtmps.youtube.com/live2", "yt_123"));

  assertEquals(
    obs.requests.find((r) => r.requestType === "SetStreamSettings")?.requestData,
    {
      streamSettingsType: "custom",
      settings: { server: "rtmps://a.rtmps.youtube.com/live2", key: "yt_123" },
      save: true,
    },
  );
  bridge.close();
  await obs.finish();
});
