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
  ) {}

  static async init(opts: {
    personaRef: string;
    facePrompt: string;
    voiceId: string;
    personalityPrompt?: string;
    avatarImageUrl?: string;
  }): Promise<PersonaVoice> {
    const avatar = await ensurePersonaAvatar(opts);
    const handle = await startConversation(avatar, {
      avatarImageUrl: opts.avatarImageUrl,
    });
    // the face should breathe between turns, not hold a still.
    await enableIdleLoop(handle);

    let profile: PersonaVoiceProfile | null = null;
    try {
      profile = await loadVoiceProfile(opts.personaRef);
    } catch {
      // no profile yet is fine: cues fall back to masky's saved defaults.
      profile = null;
    }
    return new PersonaVoice(opts.personaRef, avatar, handle, profile);
  }

  // say one utterance and get both tracks back. keep text to <= 3 sentences:
  // masky chunks longer text into extra turn docs and the id/clip pairing
  // stops being 1:1.
  async say(utterance: Utterance): Promise<Render> {
    const style = utterance.voiceStyle ??
      voiceStyleFromProfile(this.profile, utterance.medium ?? "call");

    const turn = await speak(this.handle, utterance.text, {
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
}

// ---------------------------------------------------------------------------
// the livekit side (yap) implements this; video never touches a track itself
// ---------------------------------------------------------------------------

export interface RoomPublisher {
  publish(published: { audioUrl: string; videoUrl: string }): Promise<void>;
  idle?(): Promise<void>; // no utterance: leave the idle clips playing
}

// the call loop. one voice, two rooms: every utterance goes out as the render
// the room hears and the render the room sees, from the same masky turn.
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
    const render = await voice.say(utterance);
    await publisher.publish({ audioUrl: render.audioUrl, videoUrl: render.videoUrl });
  }
}
