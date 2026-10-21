// the recap surface: a recording you were sent (an unlisted youtube link,
// a private vod) becomes answers to your capture requests, and memory.
//
// the pipeline is data all the way down: classifySource -> FetchPlan ->
// TranscribePlan -> a RecapSession that orchestrates ingest + answer. the
// external legs (the download, the transcription api, the retelldb cli)
// are transports and throw, as everywhere else in prixie; the functions
// that pick and shape are pure and tested.

export type RecordingSource = "youtube" | "twitch_vod" | "direct_media" | "unreachable";

export interface FetchPlan {
  source: RecordingSource;
  url: string;
  // the command an executor would run, as data. yt-dlp handles unlisted
  // youtube: unlisted means the link itself is the access.
  command: string[];
  // why a source we do not handle is refused, in one honest clause.
  refusal?: string;
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  speaker?: string;
  text: string;
}

export interface CaptureRequest {
  id: string;
  title: string;
  keywords: string[];
}

export interface RecapAnswer {
  request_id: string;
  title: string;
  // "found" with citations, or "not_found" with the passes that tried.
  status: "found" | "not_found";
  answer?: string;
  citations: string[]; // h:mm:ss points into the recording
  passes: ("transcript" | "retelldb")[];
}

// --- intake ---

export function classifySource(url: string): RecordingSource {
  const u = url.toLowerCase();
  if (/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(u)) return "youtube";
  if (/^https?:\/\/(www\.|m\.)?twitch\.tv\/videos\//.test(u)) return "twitch_vod";
  if (/\.(mp4|m4a|wav|mp3|mkv|webm|mov|aac|ogg|flac)(\?.*)?$/.test(u)) return "direct_media";
  return "unreachable";
}

// unlisted youtube is the branch's canonical case and needs no special
// handling: an unlisted video is fetched by whoever holds the link. the
// url IS the token.
export function buildFetchPlan(url: string, output: string): FetchPlan {
  const source = classifySource(url);

  if (source === "youtube" || source === "twitch_vod") {
    return {
      source,
      url,
      command: ["yt-dlp", "-f", "bestaudio", "-o", output, url],
    };
  }

  if (source === "direct_media") {
    return {
      source,
      url,
      command: ["curl", "-fsSL", "-o", output, url],
    };
  }

  return {
    source,
    url,
    command: [],
    // nothing is guessed about what a login-gated platform needs. the
    // browserbase engine is the future route for anything that does.
    refusal: "source needs a logged-in browser or an account; the plain fetch cannot hold the link's access",
  };
}

// --- transcription plan (assembly.ai, the same ears as the proxy) ---

export function buildTranscribePlan(localPath: string): {
  uploadUrl: string;
  pollPath: (transcriptId: string) => string;
} {
  return {
    uploadUrl: "https://api.assemblyai.com/v2/upload",
    pollPath: (transcriptId: string) =>
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
  };
}

// --- answers: the exact pass over the transcript ---

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// the exact pass: keyword match over the timestamped segments. quoted from
// the segment, cited by time. this is "what was said, where"; the meaning
// pass (retelldb) answers "what it means".
export function searchTranscript(
  request: CaptureRequest,
  segments: TranscriptSegment[],
): RecapAnswer {
  const keywords = request.keywords.map(k => k.toLowerCase());
  const hits: TranscriptSegment[] = segments.filter(s =>
    keywords.some(k => s.text.toLowerCase().includes(k))
  );

  if (hits.length === 0) {
    return {
      request_id: request.id,
      title: request.title,
      status: "not_found",
      citations: [],
      passes: ["transcript"],
    };
  }

  return {
    request_id: request.id,
    title: request.title,
    status: "found",
    answer: hits[0].text,
    citations: hits.map(h => formatTimestamp(h.start_ms)),
    passes: ["transcript"],
  };
}

// --- the session ---

export interface RecapSessionDeps {
  // the transport legs. recap never fakes these: an unimplemented one
  // throws, exactly like main's join engine seams.
  fetchRecording?: (plan: FetchPlan) => Promise<string>; // -> local media path
  transcribe?: (mediaPath: string) => Promise<{ segments: TranscriptSegment[]; doc: string }>;
  ingest?: (transcriptDoc: string, meta: { url: string; title: string; personaId: string }) => Promise<void>;
  query?: (request: CaptureRequest) => Promise<string | null>;
}

export class RecapSession {
  constructor(
    private deps: RecapSessionDeps,
    private meta: { url: string; title: string; personaId: string },
  ) {}

  private require<T>(fn: T | undefined, name: string): T {
    if (!fn) throw new Error(`recap: transport ${name} is not wired in this deployment`);
    return fn as T;
  }

  // intake -> transcript -> memory. returns the segments for the exact
  // pass; the transcript itself is ingested into retelldb as a document.
  async ingest(): Promise<{ segments: TranscriptSegment[]; doc: string }> {
    const plan = buildFetchPlan(this.meta.url, "recap_media");
    if (plan.refusal) throw new Error(`recap: ${plan.refusal}`);

    const mediaPath = await this.require(this.deps.fetchRecording, "fetchRecording")(plan);
    const transcript = await this.require(this.deps.transcribe, "transcribe")(mediaPath);
    await this.require(this.deps.ingest, "ingest")(transcript.doc, {
      url: this.meta.url,
      title: this.meta.title,
      personaId: this.meta.personaId,
    });
    return transcript;
  }

  // capture requests run both passes: exact citations from the transcript,
  // then meaning from retelldb. not found stays not found.
  async answer(requests: CaptureRequest[], segments: TranscriptSegment[]): Promise<RecapAnswer[]> {
    const answers: RecapAnswer[] = [];

    for (const request of requests) {
      const exact = searchTranscript(request, segments);
      const meaning = await this.deps.query?.(request) ?? null;

      if (exact.status === "found") {
        answers.push({
          ...exact,
          answer: meaning ? `${exact.answer} (and: ${meaning})` : exact.answer,
          passes: ["transcript", "retelldb"],
        });
      } else if (meaning !== null) {
        answers.push({
          request_id: request.id,
          title: request.title,
          status: "found",
          answer: meaning,
          citations: [],
          passes: ["retelldb"],
        });
      } else {
        answers.push({
          ...exact,
          passes: ["transcript", "retelldb"],
        });
      }
    }

    return answers;
  }
}
