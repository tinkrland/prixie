// recap session tests: the transports are fakes here, but every fake
// throws where a real transport would, so the session's error contract
// is what gets pinned: no transport fakes its own success, and no
// answer is invented that the passes did not produce.

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  RecapSession,
  createDefaultTransports,
  formatTimestamp,
  searchTranscript,
  type CaptureRequest,
  type RecapSessionDeps,
  type TranscriptSegment,
} from "../server/recap.ts";

const SEGMENTS: TranscriptSegment[] = [
  { start_ms: 0, end_ms: 4000, speaker: "host", text: "welcome everyone, we are starting now" },
  { start_ms: 65_000, end_ms: 70_000, speaker: "host", text: "the access code is apple-bird-42, use it tonight" },
  { start_ms: 3700_000, end_ms: 3710_000, speaker: "guest", text: "the deadline moved to next friday" },
];

const CODE_REQUEST: CaptureRequest = {
  id: "r1",
  title: "the access code",
  keywords: ["access code"],
};

const MISSING: CaptureRequest = {
  id: "r2",
  title: "the catering order",
  keywords: ["catering"],
};

Deno.test("formatTimestamp: mm:ss under an hour, h:mm:ss over", () => {
  assertEquals(formatTimestamp(65_000), "1:05");
  assertEquals(formatTimestamp(3_700_000), "1:01:40");
});

Deno.test("searchTranscript: exact pass quotes the segment and cites h:mm:ss", () => {
  const a = searchTranscript(CODE_REQUEST, SEGMENTS);
  assertEquals(a.status, "found");
  assertEquals(a.answer, "the access code is apple-bird-42, use it tonight");
  assertEquals(a.citations, ["1:05"]);
  assertEquals(a.passes, ["transcript"]);
});

Deno.test("searchTranscript: no hit stays not_found, passes recorded", () => {
  const a = searchTranscript(MISSING, SEGMENTS);
  assertEquals(a.status, "not_found");
  assertEquals(a.citations, []);
  assertEquals(a.passes, ["transcript"]);
});

function fakeDeps(over: Partial<RecapSessionDeps> = {}): RecapSessionDeps {
  return {
    fetchRecording: async () => "recap_media",
    transcribe: async () => ({ segments: SEGMENTS, doc: "# transcript\n\nfake doc" }),
    ingest: async () => {},
    query: async () => null,
    ...over,
  };
}

Deno.test("session ingest: media -> transcript -> memory, in order", async () => {
  const calls: string[] = [];
  const session = new RecapSession(
    {
      fetchRecording: async () => {
        calls.push("fetch");
        return "recap_media";
      },
      transcribe: async () => {
        calls.push("transcribe");
        return { segments: SEGMENTS, doc: "doc" };
      },
      ingest: async () => {
        calls.push("ingest");
      },
      query: async () => null,
    },
    { url: "https://youtu.be/x", title: "t", personaId: "prixie" },
  );
  const { segments } = await session.ingest();
  assertEquals(calls, ["fetch", "transcribe", "ingest"]);
  assertEquals(segments.length, 3);
});

Deno.test("session: a missing transport throws, it is never skipped", async () => {
  const session = new RecapSession(
    { fetchRecording: undefined, transcribe: fakeDeps().transcribe, ingest: fakeDeps().ingest, query: fakeDeps().query },
    { url: "https://youtu.be/x", title: "t", personaId: "prixie" },
  );
  await assertRejects(() => session.ingest(), Error, "fetchRecording is not wired");
});

Deno.test("session answer: exact hit + meaning hit merge into one found answer", async () => {
  const session = new RecapSession(
    fakeDeps({ query: async () => "the code is for the private repo" }),
    { url: "https://youtu.be/x", title: "t", personaId: "prixie" },
  );
  const answers = await session.answer([CODE_REQUEST], SEGMENTS);
  assertEquals(answers[0].status, "found");
  assertEquals(answers[0].passes, ["transcript", "retelldb"]);
  assertEquals(answers[0].answer, "the access code is apple-bird-42, use it tonight (and: the code is for the private repo)");
});

Deno.test("session answer: meaning-only hit is found with no citations, honestly", async () => {
  const session = new RecapSession(
    fakeDeps({ query: async () => "catering was cancelled per last week's note" }),
    { url: "https://youtu.be/x", title: "t", personaId: "prixie" },
  );
  const answers = await session.answer([MISSING], SEGMENTS);
  assertEquals(answers[0].status, "found");
  assertEquals(answers[0].citations, []);
  assertEquals(answers[0].passes, ["retelldb"]);
});

Deno.test("session answer: both passes miss -> not_found, both passes recorded", async () => {
  const session = new RecapSession(fakeDeps(), { url: "https://youtu.be/x", title: "t", personaId: "prixie" });
  const answers = await session.answer([MISSING], SEGMENTS);
  assertEquals(answers[0].status, "not_found");
  assertEquals(answers[0].passes, ["transcript", "retelldb"]);
});

Deno.test("default transports: every leg is present, none is a stub", () => {
  const deps = createDefaultTransports();
  for (const leg of ["fetchRecording", "transcribe", "ingest", "query"] as const) {
    assertEquals(typeof deps[leg], "function");
  }
});
