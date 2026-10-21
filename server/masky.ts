// masky.ai client. generates prixie's talking avatar video from her audio.
// skeleton: endpoints and payload shapes are stubbed until the api key + docs
// arrive. the seam below is the only thing callers depend on.

const MASKY_API_KEY = Deno.env.get("MASKY_API_KEY") || "";
const MASKY_BASE = Deno.env.get("MASKY_BASE_URL") || "https://api.masky.ai/v1";

export interface AvatarRequest {
  audioUrl: string;    // her TTS audio for this utterance
  personaRef?: string; // which face she is wearing today (profile system on main)
}

export interface AvatarResult {
  videoUrl: string;    // the rendered talking-head clip
  durationMs: number;
}

// generate a talking avatar clip from one utterance of audio.
// TODO: real endpoint, auth header, and request/response shape from masky.ai docs.
export async function generateAvatar(req: AvatarRequest): Promise<AvatarResult> {
  if (!MASKY_API_KEY) {
    throw new Error("masky.ai not configured (MASKY_API_KEY)");
  }
  throw new Error("not implemented: masky.ai endpoint details pending");
}

// stream-friendly variant for the live loop: chunk the audio, keep the face moving.
// TODO: whether masky supports streaming generation or is clip-based only.
export async function generateAvatarStream(req: AvatarRequest): Promise<ReadableStream<Uint8Array>> {
  throw new Error("not implemented: streaming support unknown until masky.ai docs arrive");
}
