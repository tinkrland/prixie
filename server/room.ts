// livekit room service. creates the token prixie joins with and defines her
// lifecycle inside a livekit room. skeleton: real wiring after sdk surface pick.

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") || "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") || "";
const LIVEKIT_SECRET = Deno.env.get("LIVEKIT_SECRET") || "";

export interface PrixieRoom {
  roomName: string;
  participantName: string;
}

// create an access token with join + publish grants.
// TODO: sign a real jwt with LIVEKIT_SECRET (server sdk) once the sdk surface
// is picked. grant: roomJoin, canPublish, canSubscribe.
export function createRoomToken(opts: PrixieRoom): string {
  if (!LIVEKIT_API_KEY || !LIVEKIT_SECRET) {
    throw new Error("livekit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_SECRET)");
  }
  throw new Error("not implemented: token signing lands with the livekit sdk integration");
}

// join the room, publish TTS, subscribe to everyone else.
// leaves the room when the meeting ends.
export async function joinRoom(opts: PrixieRoom): Promise<void> {
  throw new Error("not implemented: audio transport lands with the livekit sdk integration");
}
