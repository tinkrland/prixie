// masky.ai client. prixie's face: a talking avatar rendered from what she says.
// api reference: https://masky.ai/masky-api.md (base https://masky.ai/api).
//
// the shape matters more than the endpoints: masky is clip-based, not a
// streaming face. a conversation holds a sequence of turns; each speak turn
// renders lip-synced video (~30-60s) and the live url auto-plays turns in
// order. the gap between clips is filled by silent idle renders (blinks,
// small head motion) while the next turn renders. scripted speak turns are
// cached: identical text + avatar + voice renders once, replays are free.
//
// note on voice: the speak flow takes TEXT, not audio. masky owns the tts
// (higgs, with delivery cues via voiceStyle) and the lip-sync together.
// yap's live voice stays separate; for camera presence the avatar's cloned
// voice is the one on screen.

const MASKY_API_KEY = Deno.env.get("MASKY_API_KEY") || "";
const MASKY_BASE = Deno.env.get("MASKY_BASE_URL") || "https://masky.ai/api";

// verified live (oct 21 2026): image -> avatar -> conversation -> speak turn
// renders a lip-synced h264+aac clip in ~20s; turnLiveUrl (/live/t-...) is the
// clean single-clip player. see design.md for the camera publishing seam.

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface Voice {
  id: string;
  name: string;
  source: string;
}

export interface Avatar {
  avatarId: string;
  avatarOwnerUserId: string; // required by /conversations even though the docs omit it
  displayName: string;
  avatarImageUrl: string | null;
  personalityPrompt: string | null;
  voiceId: string | null;
  publiclyRenderable: boolean;
}

export interface VoiceStyle {
  emotion?: string; // elation, enthusiasm, determination, confusion, ...
  style?: "singing" | "shouting" | "whispering";
  prosody?: string[]; // speed_fast, pitch_low, expressive_high, ...
}

export interface ConversationHandle {
  conversationId: string;
  shareSlug: string;
  liveUrl: string; // embeddable; auto-plays each turn as it renders
  isPublic: boolean;
}

export interface SpeakOptions {
  voiceStyle?: VoiceStyle;
  reinterpret?: boolean;
  // draft is the default: cheaper per second, and the face is presence, not a
  // render. standard/high for the lines that matter (hello clip, demo).
  quality?: "draft" | "standard" | "high";
}

export interface Turn {
  id: string;
  role: string;
  status: "pending" | "ready" | "error";
  output: "text" | "audio" | "video";
  avatarText: string | null;
  audioUrl: string | null; // populated once tts finishes
  videoUrl: string | null; // populated once the talking head finishes
  shareSlug: string | null;
  liveUrl: string | null; // /live/t-... single-turn player, minted when media is ready
  errorMessage: string | null;
  fromSpeakCache?: boolean;
}

export interface AvatarResult {
  turnId: string;
  videoUrl: string;
  audioUrl: string;
  turnLiveUrl: string; // clean single-clip player, safe to embed
  fromSpeakCache: boolean;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!MASKY_API_KEY) {
    throw new Error("masky.ai not configured (MASKY_API_KEY)");
  }
  const resp = await fetch(`${MASKY_BASE}${path}`, {
    method,
    headers: {
      "authorization": `Bearer ${MASKY_API_KEY}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const err = data as { error?: string };
    throw new Error(
      `masky ${method} ${path} failed: ${resp.status} ${err?.error ?? text}`,
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// avatars
// ---------------------------------------------------------------------------

export function listVoices(): Promise<{ voices: Voice[] }> {
  return call("GET", "/voices");
}

export async function listAvatars(): Promise<Avatar[]> {
  const data = await call<{ avatars: Avatar[] }>("GET", "/avatars");
  return data.avatars;
}

// text-to-image. the returned url feeds straight into createAvatar.
export function generatePortraitImage(
  prompt: string,
  aspectRatio: "1:1" | "4:5" | "16:9" = "1:1",
): Promise<{ imageUrl: string; creditCost: number }> {
  return call("POST", "/images/generate", { prompt, aspectRatio });
}

export function createAvatar(opts: {
  displayName: string;
  imageUrl: string;
  personalityPrompt?: string;
  voiceId: string;
}): Promise<{ avatar: Avatar }> {
  return call("POST", "/avatars", {
    displayName: opts.displayName,
    imageUrl: opts.imageUrl,
    personalityPrompt: opts.personalityPrompt,
    voiceId: opts.voiceId,
  });
}

// each persona wears its own face: find by name, or create (image + voice) on
// first use. safe to call repeatedly.
export async function ensurePersonaAvatar(opts: {
  personaRef: string;
  facePrompt: string; // passed to text-to-image when the persona is new
  voiceId: string;
  personalityPrompt?: string;
}): Promise<Avatar> {
  const existing = (await listAvatars()).find(
    (a) => a.displayName === opts.personaRef,
  );
  if (existing) return existing;

  const { imageUrl } = await generatePortraitImage(opts.facePrompt);
  const { avatar } = await createAvatar({
    displayName: opts.personaRef,
    imageUrl,
    voiceId: opts.voiceId,
    personalityPrompt: opts.personalityPrompt,
  });
  return avatar;
}

// ---------------------------------------------------------------------------
// conversations: the camera surface
// ---------------------------------------------------------------------------

export async function startConversation(
  avatar: Avatar,
  opts: { avatarImageUrl?: string } = {},
): Promise<ConversationHandle> {
  // the endpoint rejects the request without avatarOwnerUserId; the api
  // reference's example omits it, but live calls 400 without it.
  const data = await call<{
    conversationId: string;
    shareSlug: string;
    liveUrl: string;
  }>("POST", "/conversations", {
    avatarId: avatar.avatarId,
    avatarOwnerUserId: avatar.avatarOwnerUserId,
    ...(opts.avatarImageUrl ? { avatarImageUrl: opts.avatarImageUrl } : {}),
  });
  return { ...data, isPublic: false };
}

// idle clips: blinks and small head motion that loop in the live view
// whenever nothing is playing. this is what closes the gap between turns.
// billed once per avatar image (3 x 10s default), reused across conversations.
export async function enableIdleLoop(handle: ConversationHandle): Promise<void> {
  await call("POST", `/conversations/${handle.conversationId}/silent-renders`, {
    enabled: true,
  });
}

// speak one utterance, verbatim. <= 500 chars; keep to <= 3 sentences so
// turn id and clip stay 1:1 (longer text is auto-chunked into extra turns).
export async function speak(
  handle: ConversationHandle,
  text: string,
  opts: SpeakOptions = {},
): Promise<Turn> {
  if (text.length > 500) {
    throw new Error(`utterance too long for one turn (${text.length} > 500 chars); split it`);
  }
  const quality = opts.quality ?? "draft";
  const data = await call<{ turn: Turn }>(
    "POST",
    `/conversations/${handle.conversationId}/turn`,
    {
      userText: text,
      mode: "speak",
      output: "video",
      // draft by default: a meeting face is presence, not a render. a meeting
      // face is presence, not a render: /api/videos/pricing has draft at
      // 0.015/s vs 0.025/s full at 720p. draft is a documented boolean on the
      // video endpoint and is accepted on turns (verified live: 202);
      // quality is only sent for the documented standard/high enum.
      ...(quality === "draft" ? { draft: true } : { quality }),
      ...(opts.voiceStyle ? { voiceStyle: opts.voiceStyle } : {}),
      ...(opts.reinterpret ? { reinterpret: true } : {}),
    },
  );
  return data.turn;
}

async function readConversation(handle: ConversationHandle): Promise<Turn[]> {
  const data = await call<{ turns: Turn[] }>(
    "GET",
    `/conversations/by-slug/${handle.shareSlug}`,
  );
  return data.turns;
}

// poll until the turn's video is ready. video turns take ~30-60s; cached
// scripts come back instantly with fromSpeakCache.
export async function waitForClip(
  handle: ConversationHandle,
  turnId: string,
  timeoutMs = 120_000,
): Promise<AvatarResult> {
  const t0 = Date.now();
  for (;;) {
    const turns = await readConversation(handle);
    const turn = turns.find((t) => t.id === turnId);
    if (turn?.status === "error") {
      throw new Error(`masky render failed: ${turn.errorMessage ?? "unknown error"}`);
    }
    if (turn?.videoUrl) {
      return {
        turnId: turn.id,
        videoUrl: turn.videoUrl,
        audioUrl: turn.audioUrl ?? "",
        turnLiveUrl: turn.liveUrl ?? "",
        fromSpeakCache: turn.fromSpeakCache ?? false,
        elapsedMs: Date.now() - t0,
      };
    }
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`masky render timed out after ${timeoutMs}ms (turn ${turnId})`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

// share the camera page: public tokenless live url (for iframes, obs).
export async function makePublic(handle: ConversationHandle): Promise<string> {
  const data = await call<{ liveUrl: string }>(
    "POST",
    `/conversations/${handle.conversationId}/visibility`,
    { isPublic: true },
  );
  handle.isPublic = true;
  return data.liveUrl;
}

// ---------------------------------------------------------------------------
// agent binding: prixie as the avatar's brain
// ---------------------------------------------------------------------------

export interface AgentBinding {
  pubkey: string; // 64-hex nostr pubkey of the harness
  relay: string; // wss://...
  timeoutSec?: number; // 5..120, default 45
  fallback?: "gemini" | "fail";
  enabled?: boolean;
}

export function bindAgentBrain(
  avatarId: string,
  binding: AgentBinding,
): Promise<{ agentBinding: AgentBinding }> {
  return call("PUT", `/avatars/${avatarId}/agent-binding`, binding);
}

export function getAgentBinding(
  avatarId: string,
): Promise<{ agentBinding: AgentBinding | null }> {
  return call("GET", `/avatars/${avatarId}/agent-binding`);
}
