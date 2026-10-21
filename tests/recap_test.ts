// recap branch tests: intake plans, the exact pass, and the session's
// orchestration, all pure (the transports are fakes; the real ones throw).

import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  buildFetchPlan,
  classifySource,
  formatTimestamp,
  RecapSession,
  searchTranscript,
  type CaptureRequest,
  type TranscriptSegment,
} from "../server/recap.ts";

Deno.test("an unlisted youtube link classifies and fetches like any youtube link", () => {
  // unlisted is not a protocol difference: the link is the token.
  const url = "https://youtu.be/a1B2c3D4e5F";
  assertEquals(classifySource(url), "youtube");

  const plan = buildFetchPlan(url, "recap_media");
  assertEquals(plan.source, "youtube");
  assertEquals(plan.refusal, undefined);
  assertEquals(plan.command[0], "yt-dlp");
  assert(plan.command.includes(url), "the url is the auth: it must ride the command");
});

Deno.test("twitch vods, direct media, and honest refusals", () => {
  assertEquals(classifySource("https://www.twitch.tv/videos/123456789"), "twitch_vod");
  assertEquals(classifySource("https://cdn.example.com/session.mp4"), "direct_media");

  const vod = buildFetchPlan("https://www.twitch.tv/videos/123456789", "recap_media");
  assertEquals(vod.command[0], "yt-dlp");

  const direct = buildFetchPlan("https://cdn.example.com/session.mp4", "recap_media");
  assertEquals(direct.command[0], "curl");

  const refused = buildFetchPlan("https://drive.google.com/file/d/xyz/view", "recap_media");
  assertEquals(refused.source, "unreachable");
  assertEquals(refused.command, []);
  assert(refused.refusal, "a login-gated source is refused with a reason, not fumbled");
});

Deno.test("timestamp citations format as h:mm:ss", () => {
  assertEquals(formatTimestamp(0), "0:00");
  assertEquals(formatTimestamp(65_000), "1:05");
  assertEquals(formatTimestamp(4_365_000), "1:12:45");
});

Deno.test("the exact pass quotes the segment and cites the time", () => {
  const segments: TranscriptSegment[] = [
    { start_ms: 4_365_000, end_ms: 4_368_000, speaker: "host", text: "the access code is PRIXIE 2026 X9" },
    { start_ms: 500_000, end_ms: 502_000, text: "welcome everyone to the session" },
  ];
  const request: CaptureRequest = { id: "cr_1", title: "access code", keywords: ["access code"] };

  const answer = searchTranscript(request, segments);
  assertEquals(answer.status, "found");
  assertEquals(answer.answer, "the access code is PRIXIE 2026 X9");
  assertEquals(answer.citations, ["1:12:45"]);
});

Deno.test("the exact pass reports not found instead of padding", () => {
  const segments: TranscriptSegment[] = [
    { start_ms: 0, end_ms: 1000, text: "nothing relevant here" },
  ];
  const request: CaptureRequest = { id: "cr_2", title: "api timeline", keywords: ["timeline"] };

  const answer = searchTranscript(request, segments);
  assertEquals(answer.status, "not_found");
  assertEquals(answer.citations, []);
});

Deno.test("the session runs both passes and keeps not_found honest", async () => {
  const segments: TranscriptSegment[] = [
    { start_ms: 60_000, end_ms: 62_000, text: "the deadline is friday" },
  ];

  const ingestions: { url: string; title: string; personaId: string }[] = [];
  const session = new RecapSession(
    {
      fetchRecording: async (plan) => {
        assert(plan.command.length > 0);
        return "recap_media";
      },
      transcribe: async () => ({
        segments,
        doc: "# session transcript\n\nthe deadline is friday",
      }),
      ingest: async (_doc, meta) => {
        ingestions.push(meta);
      },
      query: async (request) =>
        request.id === "cr_1" ? "friday was said twice, it is the hard deadline" : null,
    },
    { url: "https://youtu.be/a1B2c3D4e5F", title: "planning session", personaId: "the owner" },
  );

  const transcript = await session.ingest();
  assertEquals(ingestions.length, 1);
  assertEquals(ingestions[0].personaId, "the owner");
  assertEquals(ingestions[0].url, "https://youtu.be/a1B2c3D4e5F");
  assertEquals(transcript.segments, segments);

  const answers = await session.answer(
    [
      { id: "cr_1", title: "deadline", keywords: ["deadline"] },
      { id: "cr_2", title: "venue", keywords: ["venue"] },
    ],
    segments,
  );

  const deadline = answers.find(a => a.request_id === "cr_1")!;
  assertEquals(deadline.status, "found");
  assertEquals(deadline.passes, ["transcript", "retelldb"]);
  assert(deadline.answer!.includes("friday was said twice"), "the meaning pass joins the exact pass");

  const venue = answers.find(a => a.request_id === "cr_2")!;
  assertEquals(venue.status, "not_found");
  assertEquals(venue.passes, ["transcript", "retelldb"]);
});

Deno.test("an unwired transport throws, never fakes", async () => {
  const session = new RecapSession(
    {},
    { url: "https://youtu.be/a1B2c3D4e5F", title: "planning session", personaId: "the owner" },
  );
  await assertRejects(() => session.ingest(), Error, "transport");
});

Deno.test("a refused source never reaches the transports", async () => {
  const session = new RecapSession(
    {
      fetchRecording: async () => {
        throw new Error("should not be called");
      },
    },
    { url: "https://drive.google.com/file/d/xyz/view", title: "gated", personaId: "the owner" },
  );
  await assertRejects(() => session.ingest(), Error, "recap:");
});
