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

import { defaultRtcFactory, type RtcFactory, type VoiceRoom } from "./audio_transport.ts";

// read at call time: a missing credential errors at the moment of use,
// which is the honest moment (module load is not a deployment check)
function livekitEnv(): { url: string; apiKey: string; secret: string } {
  return {
    url: Deno.env.get("LIVEKIT_URL") || "",
    apiKey: Deno.env.get("LIVEKIT_API_KEY") || "",
    secret: Deno.env.get("LIVEKIT_SECRET") || "",
  };
}

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
export async function sessionVoiceToken(session: JoinedSession): Promise<string> {
  const { apiKey, secret } = livekitEnv();
  if (!apiKey || !secret) {
    throw new Error("livekit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_SECRET)");
  }

  const token = new AccessToken(apiKey, secret, {
    identity: session.identity,
    name: session.identity,
  });
  token.addGrant({
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
export async function speakInSession(
  session: JoinedSession,
  factory: RtcFactory = defaultRtcFactory(),
): Promise<VoiceRoom> {
  const { url } = livekitEnv();
  if (!url) {
    throw new Error("livekit url not configured (LIVEKIT_URL)");
  }
  // the token is minted for the session's OWN room and identity: the
  // audio comes out of the person the room already knows
  const token = await sessionVoiceToken(session);
  return factory.connect(url, token);
}

// a standalone room voice-only spaces (a voice note line, a listening
// room): there she IS a new participant, and this is the only place a
// fresh identity is ever minted.
export async function createRoomToken(opts: PrixieRoom): Promise<string> {
  const { apiKey, secret } = livekitEnv();
  if (!apiKey || !secret) {
    throw new Error("livekit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_SECRET)");
  }

  const token = new AccessToken(apiKey, secret, {
    identity: opts.participantName,
    name: opts.participantName,
  });
  token.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,   // her TTS
    canSubscribe: true, // everyone else, for STT
  });
  return token.toJwt();
}

// join a standalone room, publish TTS, subscribe to everyone else.
// leaves the room when the meeting ends.
export async function joinRoom(
  opts: PrixieRoom,
  factory: RtcFactory = defaultRtcFactory(),
): Promise<VoiceRoom> {
  const { url } = livekitEnv();
  if (!url) {
    throw new Error("livekit url not configured (LIVEKIT_URL)");
  }
  // the ONLY place a fresh identity is minted: standalone voice rooms
  const token = await createRoomToken(opts);
  return factory.connect(url, token);
}
