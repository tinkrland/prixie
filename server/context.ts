// retelldb context service. what prixie knows before she speaks: the persona's
// voice profile, the persona's memory, and the prepared questions for this meeting.
// retelldb runs as its own service (retelldb serve, fastapi) or in-process; voice
// talks to it over http so the voice loop stays decoupled.

import { recallForCall } from "./memory_bridge.ts";

const RETELLDB_URL = Deno.env.get("RETELLDB_URL") || "http://localhost:8000";
const RETELLDB_API_KEY = Deno.env.get("RETELLDB_API_KEY") || "";

export interface ToneDefaults {
  warmth: number;
  sarcasm_level: number;
  playfulness: number;
  confidence: number;
}

export interface PersonaProfile {
  persona_id: string;
  display_name?: string;
  lingvist: {
    primary_languages: string[];
    code_switch_triggers: string[];
    loanword_defaults: string[];
  };
  lexica: {
    generational_markers: string[];
    slang_inventory: string[];
    fillers: string[];
    hedges: string[];
  };
  lingvica: {
    register_by_medium: Record<string, string>;
    tone_defaults: ToneDefaults;
    punctuation_as_tone: string[];
  };
}

export interface MemoryNode {
  id: string;
  title: string;
  type: "fact" | "preference" | "relationship" | "event" | "skill" | "entity";
  content: string;
  tags: string[];
  score: number;
}

export interface SpeechContext {
  persona: PersonaProfile | null;
  voiceRegister: string | null; // how she talks on voice, from register_by_medium
  relevantMemory: MemoryNode[];
  meetingTopic: string;
  preparedQuestions: string[];
  answersAlreadyHave: string[];
}

function retellHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (RETELLDB_API_KEY) h["x-api-key"] = RETELLDB_API_KEY;
  return h;
}

// the persona's voice profile: three layers, stored in their own memory graph.
export async function loadProfile(personaId: string): Promise<PersonaProfile | null> {
  const resp = await fetch(`${RETELLDB_URL}/v1/profile/${personaId}`, {
    headers: retellHeaders(),
  });
  if (resp.status === 404) return null; // no profile saved yet: she falls back to defaults
  if (!resp.ok) throw new Error(`retelldb profile fetch failed: ${resp.status}`);
  return await resp.json();
}

// the persona's memory for a query, THROUGH THE BRIDGE (anne, oct 29 2026):
// voice declares platform "voice" and, when it has one, its meeting, so the
// head can carry anchored memory instead of treating every call as a cold
// start. the policy and the anchors stay in retelldb / the proxy; this is
// only the declaration. a bridge that reaches nothing returns [] so the
// loop runs on the persona profile alone.
export async function queryMemory(
  personaId: string,
  query: string,
  topK = 5,
  meetingId?: string,
): Promise<MemoryNode[]> {
  const bridged = await recallForCall({
    query,
    personaId,
    meetingId,
    topK,
    platform: "voice",
  });
  return bridged.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type as MemoryNode["type"],
    content: n.content,
    tags: [],
    score: n.score,
  }));
}

// prepared questions live on main (CaptureRequest table). the meeting api is
// env-configured; if it is not set, the loop runs with what it has.
async function loadPreparedQuestions(meetingId: string): Promise<{ questions: string[]; answered: string[] }> {
  const meetingApi = Deno.env.get("MEETING_API_URL");
  if (!meetingApi) return { questions: [], answered: [] };
  try {
    const resp = await fetch(`${meetingApi}/meetings/${meetingId}/capture-requests`);
    if (!resp.ok) return { questions: [], answered: [] };
    const requests = await resp.json();
    return {
      questions: requests.filter((r: any) => !r.answer).map((r: any) => r.question),
      answered: requests.filter((r: any) => r.answer).map((r: any) => `${r.question} -> ${r.answer}`),
    };
  } catch {
    return { questions: [], answered: [] };
  }
}

// everything the voice loop needs before the floor opens.
export async function loadContext(
  meetingId: string,
  personaId: string,
  meetingTopic = "",
): Promise<SpeechContext> {
  const [profile, memory, qa] = await Promise.all([
    loadProfile(personaId),
    meetingTopic
      ? queryMemory(personaId, meetingTopic, 5, meetingId)
      : Promise.resolve([] as MemoryNode[]),
    loadPreparedQuestions(meetingId),
  ]);

  return {
    persona: profile,
    voiceRegister: profile?.lingvica.register_by_medium?.["voice"] ?? null,
    relevantMemory: memory,
    meetingTopic,
    preparedQuestions: qa.questions,
    answersAlreadyHave: qa.answered,
  };
}
