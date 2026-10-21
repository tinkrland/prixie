// the twitch target: the ingest every streamer knows, and nothing else.
//
// twitch's ingest is stable and public: rtmp://live.twitch.tv/app plus the
// stream key from the creator dashboard (settings -> stream). obs also
// speaks it natively as a service type; we set it as a custom target so the
// bridge treats every platform the same way.
//
// the key is a credential: it lives in the environment (TWITCH_STREAM_KEY)
// or obs's own stream settings, never in this repo.

import type { ObsBridge } from "./obs.ts";

export const TWITCH_INGEST = "rtmp://live.twitch.tv/app";

export interface StreamTarget {
  server: string;
  key: string;
}

export function twitchTarget(streamKey: string): StreamTarget {
  return { server: TWITCH_INGEST, key: streamKey };
}

export async function pointObsAtTwitch(bridge: ObsBridge, streamKey: string): Promise<void> {
  const target = twitchTarget(streamKey);
  await bridge.setStreamTarget(target.server, target.key);
}
