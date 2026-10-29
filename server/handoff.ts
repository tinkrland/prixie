// the handoff: one voice, two rooms.
//
// prixie speaks in a livekit room (yap) and wears a face in a meeting (this
// branch). those are two pipes, and they drift: the room voice says one thing
// while the mouth moves to another render. the fix is to stop having two
// voices. masky's speak turn renders the voice (higgs tts, the avatar's cloned
// voice) and the lip-sync TOGETHER; the same turn hands back an audio url and
// a video url. so:
//
//   audioUrl -> livekit audio track      (what the room hears)
//   videoUrl -> livekit camera track     (what the room sees)
//
// the room hears exactly the render the mouth is moving to, by construction,
// not by syncing two providers. masky owns the voice whenever she is on
// camera; yap's own tts only covers face-off turns. idle clips keep the face
// alive between turns instead of freezing on a still.
//
// retelldb decides what the voice is: what she knows (memory query) and how
// she says it (the persona's voice profile: lingvist/lexica/lingvica). the
// profile's tone defaults and register map onto masky's voiceStyle cues, so
// the delivery cues travel with the persona instead of being hardcoded here.

import {
  type Avatar,
  type ConversationHandle,
  type VoiceStyle,
  enableIdleLoop,
  ensurePersonaAvatar,
  startConversation,
  speak,
  waitForClip,
} from "./masky.ts";
import { defaultSet, pinSet, type SetSpec, scenePrompt } from "./set.ts";

const RETLLDB_URL = Deno.env.get("RETELLDB_URL") || "http://localhost:8000";
const RETLLDB_API_KEY = Deno.env.get("RETELLDB_API_KEY") || "";

// ---------------------------------------------------------------------------
// retelldb: the persona's voice profile
// ---------------------------------------------------------------------------

export interface ToneDefaults {
  warmth: number; // 0..1
  sarcasm_level: number;
  playfulness: number;
  confidence: number;
}

export interface PersonaVoiceProfile {
  persona_id: string;
  display_name?: string;
  lingvist?: {
    primary_languages?: string[];
    code_switch_triggers?: string[];
    loanword_defaults?: string[];
  };
  lexica?: {
    fillers?: string[];
    hedges?: string[];
    idiom_preferences?: string[];
  };
  lingvica?: {
    register_by_medium?: Record<string, string>;
    tone_defaults?: ToneDefaults;
  };
}

async function retelldb<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${RETLLDB_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(RETLLDB_API_KEY ? { "x-api-key": RETLLDB_API_KEY } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!resp.ok) {
    throw new Error(`retelldb ${path} failed: ${resp.status}`);
  }
  return await resp.json() as T;
}

export async function loadVoiceProfile(personaId: string): Promise<PersonaVoiceProfile> {
  return await retelldb<PersonaVoiceProfile>(`/v1/profile/${personaId}`);
}

// what she knows, scoped to the persona. the same graph the voice profile
// lives in, so knowledge and delivery never point at different personas.
export async function recall<T = unknown>(
  personaId: string,
  query: string,
  limit = 5,
): Promise<T> {
  return await retelldb<T>("/v1/query", {
    method: "POST",
    body: JSON.stringify({ persona_id: personaId, query, limit }),
  });
}

// ---------------------------------------------------------------------------
// profile -> delivery cues
// ---------------------------------------------------------------------------

// the profile is fuzzy on purpose (tone is scored 0..1); masky's tts takes
// named cues. this is the only place the two vocabularies meet.
export function voiceStyleFromProfile(
  profile: PersonaVoiceProfile | null,
  medium = "call",
): VoiceStyle {
  const tone = profile?.lingvica?.tone_defaults;
  const style: VoiceStyle = {};
  if (!tone) return style;

  if (tone.sarcasm_level >= 0.6) style.emotion = "amusement";
  else if (tone.playfulness >= 0.65) style.emotion = "enthusiasm";
  else if (tone.warmth >= 0.7) style.emotion = "affection";
  else if (tone.confidence >= 0.7) style.emotion = "determination";

  const prosody: string[] = [];
  // measured personas speak slower and flatter; lively ones get expressiveness.
  if (tone.confidence < 0.35) prosody.push("speed_slow", "expressive_low");
  if (tone.playfulness >= 0.7) prosody.push("expressive_high");
  if (prosody.length) style.prosody = prosody;

  // a register of "whispered" or "hushed" (a late lecture, a quiet room) is
  // the one register that has a real masky equivalent.
  const register = profile?.lingvica?.register_by_medium?.[medium] ?? "";
  if (/whisper|hushed|quiet/i.test(register)) style.style = "whispering";

  return style;
}

// ---------------------------------------------------------------------------
// the call-side persona: face + voice + memory as one object
// ---------------------------------------------------------------------------

export interface Utterance {
  text: string; // what she says (from retelldb-grounded context on yap)
  medium?: string; // "call" | "meeting" | "stage" ...
  voiceStyle?: VoiceStyle; // explicit cues win over the profile
  // grounding for the turn, when the caller has a subject to ask the head
  // about (anne, oct 29 2026). no grounding = nothing invented; see
  // server/context.ts groundTurn()
  grounding?: string | null;
}

export interface Render {
  turnId: string;
  audioUrl: string; // publish to livekit as her audio track
  videoUrl: string; // publish to livekit as her camera track
  turnLiveUrl: string; // single-clip player, if the room falls back to a web view
  fromSpeakCache: boolean;
  elapsedMs: number;
}

export class PersonaVoice {
  private constructor(
    readonly personaRef: string,
    readonly avatar: Avatar,
    readonly handle: ConversationHandle,
    readonly profile: PersonaVoiceProfile | null,
    readonly set: SetSpec,
  ) {}

  static async init(opts: {
    personaRef: string;
    facePrompt: string;
    voiceId: string;
    personalityPrompt?: string;
    avatarImageUrl?: string;
    // the room. give it a set and the conversation is pinned to the set's
    // authored still, so the background is the same in every clip instead of
    // model-invented per render.
    set?: SetSpec;
  }): Promise<PersonaVoice> {
    const avatar = await ensurePersonaAvatar(opts);
    const set = opts.set ?? defaultSet();
    const handle = await startConversation(avatar, {
      avatarImageUrl: opts.avatarImageUrl,
    });
    // the face should breathe between turns, not hold a still.
    await enableIdleLoop(handle);

    // pin the room before the first turn: every clip then opens on the same
    // authored frame (masky's /conversations/{id}/avatar-image).
    if (set.stillUrl) {
      await pinSet(avatar, handle, set.stillUrl);
    }

    let profile: PersonaVoiceProfile | null = null;
    try {
      profile = await loadVoiceProfile(opts.personaRef);
    } catch {
      // no profile yet is fine: cues fall back to masky's saved defaults.
      profile = null;
    }
    return new PersonaVoice(opts.personaRef, avatar, handle, profile, set);
  }

  // on camera: masky owns the voice (speak turns render voice + face
  // together). off camera: yap tts owns it, per the camera-off handoff.
  onCamera = true;

  // say one utterance and get both tracks back. keep text to <= 3 sentences:
  // masky chunks longer text into extra turn docs and the id/clip pairing
  // stops being 1:1.
  async say(utterance: Utterance): Promise<Render> {
    const style = utterance.voiceStyle ??
      voiceStyleFromProfile(this.profile, utterance.medium ?? "call");

    const text = utterance.grounding
      ? `${utterance.grounding}\n\n${utterance.text}`
      : utterance.text;
    const turn = await speak(this.handle, text, {
      voiceStyle: style,
      // draft by default: the face is a presence, not a render. bump to
      // standard/high per utterance when the shot matters (a hello clip, a
      // recorded demo) via Render quality on the masky call.
      quality: "draft",
    });

    const clip = await waitForClip(this.handle, turn.id);
    return {
      turnId: clip.turnId,
      audioUrl: clip.audioUrl,
      videoUrl: clip.videoUrl,
      turnLiveUrl: clip.turnLiveUrl,
      fromSpeakCache: clip.fromSpeakCache,
      elapsedMs: clip.elapsedMs,
    };
  }

  // what she knows, persona-scoped. this is the yap side's context source and
  // the reason the mouth and the memory agree on who is speaking.
  recall<T = unknown>(query: string, limit = 5): Promise<T> {
    return recall<T>(this.personaRef, query, limit);
  }

  // a scene clip in her room, not a speak turn: pass the result to
  // /videos/generate with promptUpsampling false so the model does not add
  // its own detail to a set we authored.
  scene(action: string): string {
    return scenePrompt(this.set, action);
  }
}

// ---------------------------------------------------------------------------
// camera off, voice on: the handoff that must not sound like one
// ---------------------------------------------------------------------------

// the rule: if the avatar turns off her camera mid-conversation, the voice
// keeps going as if nothing happened. the masky turn owns the current
// sentence, so it runs to the sentence's end: the audio clip is never cut.
// only the visual goes dark, and it goes dark at the browser level (the obs
// source hidden, the livekit camera track muted), never by cancelling the
// render. once the clip has finished, yap owns the voice again, and the
// conversation picks up with no odd-sounding seam and no lost context.
export interface CameraOffPlan {
  hideVisual: "now"; // the browser-level camera goes dark immediately
  keepAudioUntilMs: number; // the masky clip plays out fully
  voiceSwitch: { atMs: number; to: "yap" }; // after the sentence, yap owns the voice
  cutMidSentence: false; // by construction, not by discipline
}

export function planCameraOff(clipMs: number): CameraOffPlan {
  if (clipMs < 0) throw new Error("clipMs cannot be negative");
  return {
    hideVisual: "now",
    keepAudioUntilMs: clipMs,
    voiceSwitch: { atMs: clipMs, to: "yap" },
    cutMidSentence: false,
  };
}

export interface Timer {
  sleep(ms: number): Promise<void>;
}

// the executor. hideCamera() is the browser-level switch (obs.setSourceVisible
// false, or muting the livekit camera track). nothing in here can end the
// audio early: the sleep before unpublishMaskyAudio() IS the protocol.
export class CameraOffAdapter {
  constructor(
    private deps: {
      hideCamera(): Promise<void>;
      unpublishMaskyAudio(): Promise<void>;
      onSwitched?(): Promise<void>;
    },
    private timer: Timer = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
  ) {}

  async cameraOff(render: Render, clipMs: number): Promise<CameraOffPlan> {
    const plan = planCameraOff(clipMs);
    // 1. the visual goes dark now. the clip keeps rendering where it can
    //    still be heard; only the camera disappears.
    await this.deps.hideCamera();
    // 2. the masky turn finishes its sentence. the room hears the render
    //    the voice was already speaking, to its last syllable.
    await this.timer.sleep(plan.keepAudioUntilMs);
    // 3. the sentence is over. masky audio unpublishes, yap takes the next
    //    utterance, and face-off turns render as yap tts from here on.
    await this.deps.unpublishMaskyAudio();
    await this.deps.onSwitched?.();
    return plan;
  }
}

// ---------------------------------------------------------------------------
// the livekit side (yap) implements this; video never touches a track itself
// ---------------------------------------------------------------------------

export interface RoomPublisher {
  publish(published: { audioUrl: string; videoUrl: string }): Promise<void>;
  idle?(): Promise<void>; // no utterance: leave the idle clips playing
  // a face-off turn: she is not on camera, so yap tts says it in her voice
  // and no render is needed. voice matching lives on the yap side: the same
  // retelldb voice profile that maps to masky's voiceStyle cues selects yap's
  // voice, so the two voices are the same voice by construction.
  publishFaceOff?(utterance: Utterance): Promise<void>;
}

// the call loop. one voice, two rooms: every utterance goes out as the render
// the room hears and the render the room sees, from the same masky turn.
// after a camera-off handoff she is off camera, so utterances route to yap
// (publishFaceOff) until the camera comes back on.
export async function runCall(
  voice: PersonaVoice,
  publisher: RoomPublisher,
  hear: () => Promise<Utterance | null>, // yap: transcript -> next utterance
): Promise<void> {
  for (;;) {
    const utterance = await hear();
    if (!utterance) {
      await publisher.idle?.();
      return;
    }
    if (voice.onCamera) {
      const render = await voice.say(utterance);
      await publisher.publish({ audioUrl: render.audioUrl, videoUrl: render.videoUrl });
    } else {
      await publisher.publishFaceOff?.(utterance);
    }
  }
}
