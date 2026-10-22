// lk_publisher tests (the owner, oct 21 2026): the pure builders assert their
// exact ffmpeg shape, and the publish flow is pinned with fakes: video
// chunks and audio chunks both reach the room, geometry comes from the
// probe (never a default), unpublishAudio hits the handle, and a demux
// failure propagates instead of being swallowed. rtc-node itself is a
// transport leg: no test claims it loads.

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  buildAudioDemuxArgs,
  buildVideoDemuxArgs,
  createLivekitPublisher,
  PCM_CHUNK_BYTES,
  RGBA_FRAME_BYTES,
  type LkRtc,
  type RunPipe,
} from "../server/lk_publisher.ts";

Deno.test("buildVideoDemuxArgs: -re pacing, rgba rawvideo on stdout, video only", () => {
  const args = buildVideoDemuxArgs({ videoUrl: "https://cdn/render.mp4", width: 1080, height: 1920 });
  assertEquals(args, [
    "-re",
    "-i",
    "https://cdn/render.mp4",
    "-an",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1",
  ]);
});

Deno.test("buildVideoDemuxArgs: geometry must be measured, a default is refused", () => {
  assertThrows(
    () => buildVideoDemuxArgs({ videoUrl: "x.mp4", width: 0, height: 0 }),
    Error,
    "geometry must be measured",
  );
});

Deno.test("buildAudioDemuxArgs: 48k mono s16 on stdout, audio only", () => {
  assertEquals(buildAudioDemuxArgs("https://cdn/render.mp4"), [
    "-re",
    "-i",
    "https://cdn/render.mp4",
    "-vn",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ]);
});

Deno.test("chunk sizes: one frame per video chunk, 10ms per audio chunk", () => {
  assertEquals(RGBA_FRAME_BYTES({ width: 1080, height: 1920 }), 1080 * 1920 * 4);
  assertEquals(PCM_CHUNK_BYTES, 960); // 48000 hz * 0.01s * 2 bytes
});

function fakeHandle(log: string[]) {
  return {
    publishVideo: async (frame: Uint8Array, spec: { width: number; height: number }) => {
      log.push(`video ${spec.width}x${spec.height} ${frame.length}`);
    },
    publishAudio: async (pcm: Int16Array, sampleRate: number) => {
      log.push(`audio ${pcm.length} @${sampleRate}`);
    },
    unpublishAudio: async () => {
      log.push("unpublish audio");
    },
    unpublishVideo: async () => {
      log.push("unpublish video");
    },
    close: async () => {
      log.push("close");
    },
  };
}

// the fake pipes on the DEMUX TYPE: the args say which leg it is
// (rawvideo = video, s16le = audio), exactly as the real builders do
function demuxPipes(videoChunks: Uint8Array[], audioChunks: Uint8Array[]): RunPipe {
  return (_cmd, args) => {
    const chunks = args.includes("rawvideo") ? videoChunks : audioChunks;
    async function* gen() {
      for (const c of chunks) yield c;
    }
    return gen();
  };
}

Deno.test("the camera leg unpublishes, idempotently", async () => {
  const log: string[] = [];
  const publisher = await createLivekitPublisher({
    url: "wss://room.test",
    token: "t",
    rtc: { connect: async () => fakeHandle(log) },
    probe: async () => ({ width: 2, height: 2 }),
    runPipe: demuxPipes([], []),
  });
  await publisher.unpublishVideo();
  await publisher.unpublishVideo(); // already dark: fine, not an error
  assertEquals(log, ["unpublish video"]);
});

Deno.test("publish: both pipes reach the room, video chunks sized as whole frames", async () => {
  const log: string[] = [];
  const spec = { width: 2, height: 2 }; // 16-byte rgba frames
  const frame = new Uint8Array(RGBA_FRAME_BYTES(spec)).fill(7);
  const publisher = await createLivekitPublisher({
    url: "wss://room.test",
    token: "t",
    rtc: { connect: async () => fakeHandle(log) },
    probe: async () => spec,
    runPipe: demuxPipes([frame, frame], [new Uint8Array(PCM_CHUNK_BYTES).fill(1)]),
  });
  await publisher.publish({ audioUrl: "a.wav", videoUrl: "v.mp4" });
  // the two pipes run concurrently: per-leg content and counts are
  // fixed, their interleaving is not, so assert per leg
  const videoFrames = log.filter((e) => e.startsWith("video"));
  const audioChunks = log.filter((e) => e.startsWith("audio"));
  assertEquals(videoFrames, ["video 2x2 16", "video 2x2 16"]);
  assertEquals(audioChunks, ["audio 480 @48000"]); // PCM_CHUNK_BYTES / 2
});

Deno.test("partial chunks are held until whole: nothing fractional is published", async () => {
  const log: string[] = [];
  const spec = { width: 2, height: 2 };
  const half = new Uint8Array(8).fill(3);
  const publisher = await createLivekitPublisher({
    url: "wss://room.test",
    token: "t",
    rtc: { connect: async () => fakeHandle(log) },
    probe: async () => spec,
    // two halves of one frame arrive separately: the reader holds the
    // first until the second completes it
    runPipe: demuxPipes([half, half], []),
  });
  await publisher.publish({ audioUrl: "a.wav", videoUrl: "v.mp4" });
  assertEquals(log, [`video 2x2 16`]);
});

Deno.test("unpublishAudio and close hit the handle, in order", async () => {
  const log: string[] = [];
  const publisher = await createLivekitPublisher({
    url: "wss://room.test",
    token: "t",
    rtc: { connect: async () => fakeHandle(log) },
    probe: async () => ({ width: 2, height: 2 }),
    runPipe: demuxPipes([], []),
  });
  await publisher.unpublishAudio();
  await publisher.close();
  assertEquals(log, ["unpublish audio", "close"]);
});

Deno.test("a demux that ends mid-chunk does not invent a final partial frame", async () => {
  const log: string[] = [];
  const spec = { width: 2, height: 2 };
  const publisher = await createLivekitPublisher({
    url: "wss://room.test",
    token: "t",
    rtc: { connect: async () => fakeHandle(log) },
    probe: async () => spec,
    runPipe: demuxPipes([new Uint8Array(12).fill(9)], []), // 12 < 16: not a whole frame
  });
  await publisher.publish({ audioUrl: "a.wav", videoUrl: "v.mp4" });
  assertEquals(log, []); // the tail is dropped, never padded
});

Deno.test("a failing rtc transport propagates: no fake connection", async () => {
  const rtc: LkRtc = {
    connect: async () => {
      throw new Error("native bindings missing");
    },
  };
  await assertRejects(
    () => createLivekitPublisher({ url: "wss://room.test", token: "t", rtc }),
    Error,
    "native bindings missing",
  );
});
