// the kick target: twitch's shape, kick's reality.
//
// kick streams over rtmp like everyone else: the ingest server url and the
// stream key come from the kick creator dashboard (settings -> stream key),
// and modern obs also lists kick as a built-in service. so the bridge work is
// identical to twitch's: point obs's custom stream target at it.
//
// what kick does NOT have, as of this writing, is a mature public api for the
// rest (chat, channel info): nothing here claims it does. the stream is rtmp,
// the target is the dashboard's values, and that is the honest whole of it.
//
// the key is a credential: it lives in the environment (KICK_STREAM_KEY) with
// the dashboard's ingest url (KICK_STREAM_URL), never in this repo. unlike
// twitch's, kick's ingest is not a single stable public constant, so both
// values are read, not hardcoded.

import type { ObsBridge } from "./obs.ts";
import type { StreamTarget } from "./twitch.ts";

export function kickTarget(streamUrl: string, streamKey: string): StreamTarget {
  return { server: streamUrl, key: streamKey };
}

export function kickTargetFromEnv(): StreamTarget | null {
  const streamUrl = Deno.env.get("KICK_STREAM_URL");
  const streamKey = Deno.env.get("KICK_STREAM_KEY");
  if (!streamUrl || !streamKey) return null;
  return kickTarget(streamUrl, streamKey);
}

export async function pointObsAtKick(bridge: ObsBridge, target: StreamTarget): Promise<void> {
  await bridge.setStreamTarget(target.server, target.key);
}
