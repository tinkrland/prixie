// livekit room service. the voice side of an already joined call.
//
// the rule (the owner's, oct 21): voice happens SEAMLESSLY in a call prixie is
// already in. a new person does not request into the call. prixie's
// presence in the meeting is the join engine's session (main branch,
// browserbase); voice never creates a second participant for the same
// person, because two participants is exactly "a new person requested in".
//
// so the token is always minted for the session's OWN room and the
// identity prixie ALREADY has in that call: the audio comes out of the
// person the room already knows, not out of "prixie voice" knocking at
// the door. livekit's duplicate-identity policy (a join with an existing
// identity replaces the older connection) is the handoff seam: the join
// engine owns the connection until voice speaks, then the connection
// passes to the voice layer with the mic it needs. one identity, one
// person, no second knock.
//
// token signing is real (livekit-server-sdk); audio transport stays on
// the sdk-surface open question (rtc-node vs agents).

import { AccessToken } from "npm:livekit-server-sdk";

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") || "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") || "";
const LIVEKIT_SECRET = Deno.env.get("LIVEKIT_SECRET") || "";

export interface PrixieRoom {
  roomName: string;
  participantName: string;
}

// a session that is already joined: what voice needs to speak into it.
export interface JoinedSession {
  sessionId: string;
  roomName: string;     // the livekit room the call runs in
  identity: string;      // prixie's identity in that room already
}

// an access token for the session's own room, under the identity she
// already holds. audio publish + subscribe only: voice is not a camera.
export function sessionVoiceToken(session: JoinedSession): string {
  if (!LIVEKIT_API_KEY || !LIVEKIT_SECRET) {
    throw new Error("livekit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_SECRET)");
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_SECRET, {
    identity: session.identity,
    name: session.identity,
  });
  token.addGrants({
    room: session.roomName,
    roomJoin: true,
    canPublish: true,   // her TTS, as the person already in the room
    canSubscribe: true, // everyone else, for STT
  });
  return token.toJwt();
}

// speak into the already joined call: join the session's room under the
// session's identity, publish TTS on its audio track, subscribe to
// everyone else for STT. no room is created, no entry is requested: the
// room is the call she is already in.
//
// still an open question (unchanged): rtc-node vs the agents framework.
// the join/publish/subscribe flow itself is fixed either way.
export async function speakInSession(session: JoinedSession): Promise<void> {
  if (!LIVEKIT_URL) {
    throw new Error("livekit url not configured (LIVEKIT_URL)");
  }
  void sessionVoiceToken(session); // the token mint is exercised; transport below
  throw new Error("not implemented: audio transport lands with the livekit sdk integration");
}

// a standalone room voice-only spaces (a voice note line, a listening
// room): there she IS a new participant, and this is the only place a
// fresh identity is ever minted.
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

// join a standalone room, publish TTS, subscribe to everyone else.
// leaves the room when the meeting ends.
export async function joinRoom(opts: PrixieRoom): Promise<void> {
  if (!LIVEKIT_URL) {
    throw new Error("livekit url not configured (LIVEKIT_URL)");
  }
  throw new Error("not implemented: audio transport lands with the livekit sdk integration");
}
