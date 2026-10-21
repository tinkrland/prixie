// livekit room service. creates the token prixie joins with and defines her
// lifecycle inside a livekit room. token signing is real (livekit-server-sdk);
// audio transport stays on the sdk-surface open question (rtc-node vs agents).

import { AccessToken } from "npm:livekit-server-sdk";

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") || "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") || "";
const LIVEKIT_SECRET = Deno.env.get("LIVEKIT_SECRET") || "";

export interface PrixieRoom {
  roomName: string;
  participantName: string;
}

// create an access token with join + publish grants.
export function createRoomToken(opts: PrixieRoom): string {
  if (!LIVEKIT_API_KEY || !LIVEKIT_SECRET) {
    throw new Error("livekit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_SECRET)");
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_SECRET, {
    identity: opts.participantName,
    name: opts.participantName,
  });
  token.addGrants({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,   // her TTS
    canSubscribe: true, // everyone else, for STT
  });
  return token.toJwt();
}

// join the room, publish TTS, subscribe to everyone else.
// leaves the room when the meeting ends.
// still an open question: rtc-node vs the (python) agents framework. the
// join/publish/subscribe flow itself is fixed either way.
export async function joinRoom(opts: PrixieRoom): Promise<void> {
  if (!LIVEKIT_URL) {
    throw new Error("livekit url not configured (LIVEKIT_URL)");
  }
  throw new Error("not implemented: audio transport lands with the livekit sdk integration");
}
