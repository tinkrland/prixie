// the persona voice adapter: the one place the persona's fuzzy profile
// (tone scored 0..1) meets a tts's named cues. both surfaces import this
// file, byte-identical, synced from main by tools/sync-context.sh, so
// the voice is the same voice whether she is on camera (video branch,
// masky voiceStyle) or face-off (voice branch, tts cues): the mapping
// cannot drift between branches because there is only one mapping.
//
// VoiceStyle is duck-typed on purpose: masky's speak() takes
// { emotion?, prosody?, style? } and any tts with named cues can read
// the same shape. no masky import lives here.

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

export interface VoiceStyle {
  emotion?: string;
  prosody?: string[];
  style?: string;
}

const RETLLDB_URL = Deno.env.get("RETELLDB_URL") || "http://localhost:8000";
const RETLLDB_API_KEY = Deno.env.get("RETELLDB_API_KEY") || "";

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

// profile -> delivery cues. the profile is fuzzy on purpose (tone is
// scored 0..1); tts layers take named cues. this is the only place the
// two vocabularies meet.
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

  // a register of "whispered" or "hushed" (a late lecture, a quiet room)
  // is the one register with a real cue equivalent on every tts.
  const register = profile?.lingvica?.register_by_medium?.[medium] ?? "";
  if (/whisper|hushed|quiet/i.test(register)) style.style = "whispering";

  return style;
}
