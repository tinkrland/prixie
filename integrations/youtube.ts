// the youtube target: the live stream that shows up at youtube.com.
//
// youtube live custom-encoder streams are rtmp too, but unlike twitch
// there is no single stable ingest constant to hardcode: the studio's
// "go live" flow shows an account-specific stream url (the
// a.rtmps.youtube.com/liveN family) with a stream key under it, and
// both rotate. so it is kick's shape, not twitch's: both values are
// read from the environment (YOUTUBE_STREAM_URL, YOUTUBE_STREAM_KEY)
// and never hardcoded, never in this repo.
//
// what youtube has beyond the ingest is its own live chat api, but
// reading it is the webinar/watch side of the proxy, not the stream
// target: nothing here claims it.

import type { ObsBridge } from "./obs.ts";
import type { StreamTarget } from "./twitch.ts";

export function youtubeTarget(streamUrl: string, streamKey: string): StreamTarget {
  return { server: streamUrl, key: streamKey };
}

export function youtubeTargetFromEnv(): StreamTarget | null {
  const streamUrl = Deno.env.get("YOUTUBE_STREAM_URL");
  const streamKey = Deno.env.get("YOUTUBE_STREAM_KEY");
  if (!streamUrl || !streamKey) return null;
  return youtubeTarget(streamUrl, streamKey);
}

export async function pointObsAtYoutube(bridge: ObsBridge, target: StreamTarget): Promise<void> {
  await bridge.setStreamTarget(target.server, target.key);
}
