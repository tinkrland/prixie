// the livekit publisher (the owner, oct 21 2026): design.md order-of-work
// item 3, the camera publishing seam. masky hands back a render (h264+aac
// mp4, ~6s for a line); this publishes it into the room as her camera
// track and her audio track, at native speed.
//
// the shape, as everywhere in prixie:
//   - buildDemuxArgs is a PURE builder: two ffmpeg -re commands, one
//     piping rgba frames, one piping 48k mono s16 pcm. -re paces the
//     pipes at the clip's own frame rate, so capture happens at realtime
//     by construction, not by a sleep loop.
//   - the rtc-node sdk sits behind LkRtc, imported lazily at connect
//     time: a deployment without the native bindings fails with a clear
//     error when voice actually speaks, never at module load.
//   - the ffmpeg legs are injected too, so tests pin the flow without
//     running ffmpeg.
//
// one voice, two rooms stays true: this publisher owns the room where
// the room SEES her (the camera track); voice owns the voice when she is
// off camera (publishFaceOff), which this side deliberately does not
// implement.

import type { RoomPublisher } from "./handoff.ts";

// the room's geometry comes from the render itself, never a guess: the
// caller reads the clip and hands in what it measured.
export interface DemuxSpec {
  videoUrl: string;
  width: number;
  height: number;
}

export function buildVideoDemuxArgs(spec: DemuxSpec): string[] {
  if (spec.width <= 0 || spec.height <= 0) {
    throw new Error(`lk_publisher: clip geometry must be measured, got ${spec.width}x${spec.height}`);
  }
  return [
    "-re", // read at native frame rate: the pipe IS the pacing
    "-i",
    spec.videoUrl,
    "-an", // video only on this pipe
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1",
  ];
}

export function buildAudioDemuxArgs(videoUrl: string): string[] {
  return [
    "-re",
    "-i",
    videoUrl,
    "-vn", // audio only on this pipe
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "pipe:1",
  ];
}

// the raw sizes per unit of pipe data: the readers chunk stdout by
// these, and a partial chunk is held until it is whole.
export const RGBA_FRAME_BYTES = (spec: { width: number; height: number }) =>
  spec.width * spec.height * 4;
export const PCM_CHUNK_BYTES = 480 * 2; // 10ms of 48k mono s16: 480 samples

export interface LkRoomHandle {
  publishVideo(frame: Uint8Array, spec: { width: number; height: number }): Promise<void>;
  publishAudio(pcm: Int16Array, sampleRate: number): Promise<void>;
  unpublishAudio(): Promise<void>;
  // the camera-off leg, meeting-side: the video track unpublishes, the
  // room sees her camera go dark. the audio keeps its own protocol.
  unpublishVideo(): Promise<void>;
  close(): Promise<void>;
}

export interface LkRtc {
  connect(url: string, token: string): Promise<LkRoomHandle>;
}

// pipe transport: a command run whose stdout is consumed in chunks.
// deno.Command is the default; tests inject a fake.
export type RunPipe = (cmd: string, args: string[]) => AsyncIterable<Uint8Array>;

export function denoRunPipe(): RunPipe {
  return (cmd, args) => {
    async function* gen() {
      const command = new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" });
      const process = command.spawn();
      const reader = process.stdout.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
        const status = await process.status;
        if (!status.success) {
          throw new Error(`lk_publisher: ${cmd} demux failed (exit ${status.code})`);
        }
      } finally {
        reader.releaseLock();
        try {
          process.kill();
        } catch {
          // already exited
        }
      }
    }
    return gen();
  };
}

async function readChunks(
  stream: AsyncIterable<Uint8Array>,
  chunkBytes: number,
  onChunk: (chunk: Uint8Array) => Promise<void>,
): Promise<void> {
  let buffer = new Uint8Array(0);
  for await (const part of stream) {
    const merged = new Uint8Array(buffer.length + part.length);
    merged.set(buffer);
    merged.set(part, buffer.length);
    buffer = merged;
    while (buffer.length >= chunkBytes) {
      const chunk = buffer.slice(0, chunkBytes);
      await onChunk(chunk);
      buffer = buffer.slice(chunkBytes);
    }
  }
}

// the default rtc transport: livekit rtc-node, loaded on demand.
export function defaultLkRtc(): LkRtc {
  return {
    async connect(url: string, token: string): Promise<LkRoomHandle> {
      let rtc: any;
      try {
        rtc = await import("npm:@livekit/rtc-node@2");
      } catch (e) {
        throw new Error(
          `lk_publisher: the livekit rtc-node sdk could not load (native bindings missing?): ${e instanceof Error ? e.message : e}`,
        );
      }
      const room = new rtc.Room({ adaptiveStream: false, dynacast: false });
      await room.connect(url, token);

      // both tracks are rebuilt-state: the source/track pair swaps together
      // when a render's geometry differs from the placeholder, and each leg
      // republishes itself after an unpublish (camera off / on cycles).
      const video = {
        source: new rtc.VideoSource(
          new rtc.VideoFrame(rtc.VideoFormatType.RGBA, 480, 270),
          1000,
        ),
        track: null as any,
        up: false,
        published: 0,
      };
      video.track = new rtc.LocalVideoTrack(video.source);
      await room.localParticipant.publishTrack(video.track, { name: "prixie camera" });
      video.up = true;

      const audio = {
        source: new rtc.AudioSource(48000, 1),
        track: null as any,
        up: false,
      };
      audio.track = new rtc.LocalAudioTrack(audio.source);
      await room.localParticipant.publishTrack(audio.track, { name: "prixie voice" });
      audio.up = true;

      return {
        async publishVideo(frame, spec) {
          // the source is rebuilt at the render's real geometry when the
          // first frame says so: the room sees the clip's own pixels,
          // stretched by no one. source and track swap together; frames
          // only ever go to the source of the live track.
          if (video.published === 0 && (spec.width !== 480 || spec.height !== 270)) {
            if (video.up) await video.track.unpublish();
            video.source = new rtc.VideoSource(
              new rtc.VideoFrame(rtc.VideoFormatType.RGBA, spec.width, spec.height),
              1000,
            );
            video.track = new rtc.LocalVideoTrack(video.source);
            await room.localParticipant.publishTrack(video.track, { name: "prixie camera" });
            video.up = true;
          }
          video.published++;
          const vf = new rtc.VideoFrame(
            new rtc.VideoBuffer(spec.width, spec.height, rtc.VideoFormatType.RGBA),
            frame,
            0,
          );
          await video.source.captureFrame(vf, 0);
        },
        async publishAudio(pcm, sampleRate) {
          if (!audio.up) {
            // the camera-off handoff unpublished this leg; a turn that puts
            // her back on camera republishes it before it speaks
            audio.source = new rtc.AudioSource(48000, 1);
            audio.track = new rtc.LocalAudioTrack(audio.source);
            await room.localParticipant.publishTrack(audio.track, { name: "prixie voice" });
            audio.up = true;
          }
          await audio.source.captureFrame(
            new rtc.AudioFrame(pcm, sampleRate, 1, pcm.length),
          );
        },
        async unpublishAudio() {
          if (!audio.up) return; // idempotent: nothing in flight is fine
          await audio.track.unpublish();
          audio.up = false;
        },
        async unpublishVideo() {
          if (!video.up) return; // idempotent: the camera is already dark
          await video.track.unpublish();
          video.up = false;
        },
        async close() {
          await room.disconnect();
        },
      };
    },
  };
}

export interface LivekitPublisherDeps {
  url: string;
  token: string;
  rtc?: LkRtc;
  runPipe?: RunPipe;
  // geometry from the clip: ffprobe by default, injectable so tests
  // never depend on a binary being installed
  probe?: (videoUrl: string) => Promise<{ width: number; height: number }>;
}

export async function ffprobeGeometry(videoUrl: string): Promise<{ width: number; height: number }> {
  const command = new Deno.Command("ffprobe", {
    args: ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", videoUrl],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await command.output();
  if (!out.success) {
    throw new Error(`lk_publisher: ffprobe failed on ${videoUrl}`);
  }
  const text = new TextDecoder().decode(out.stdout).trim();
  const [w, h] = text.split(",").map((n) => Number(n));
  if (!w || !h) {
    throw new Error(`lk_publisher: could not read geometry from ${videoUrl}: "${text}"`);
  }
  return { width: w, height: h };
}

// the publisher runCall drives: publish() plays the whole clip into the
// room (the await IS the clip's duration, by -re pacing), unpublishAudio
// is the camera-off handoff's leg (idempotent: nothing in flight = fine),
// close() when the call ends. publishFaceOff is deliberately absent:
// voice owns the voice when she is off camera.
export async function createLivekitPublisher(deps: LivekitPublisherDeps): Promise<LkPublisher> {
  const rtc = deps.rtc ?? defaultLkRtc();
  const runPipe = deps.runPipe ?? denoRunPipe();
  const probe = deps.probe ?? ffprobeGeometry;
  const handle = await rtc.connect(deps.url, deps.token);

  let inFlight: Promise<void> | null = null;
  // idempotence is the surface's promise, not the transport's mood: the
  // camera leg and the audio leg both tolerate being called when they
  // are already down ("nothing in flight is fine"), whatever the handle
  // underneath would do with a second call.
  let videoUp = true;
  let audioUp = true;

  return new (class implements LkPublisher {
    async publish(published: { audioUrl: string; videoUrl: string }): Promise<void> {
      // a render is on camera and spoken: both legs are up for it
      videoUp = true;
      audioUp = true;
      // the geometry comes from the clip before either pipe starts:
      // measured, never a default
      const spec = await probe(published.videoUrl);
      const videoP = readChunks(
        runPipe("ffmpeg", buildVideoDemuxArgs({ videoUrl: published.videoUrl, ...spec })),
        RGBA_FRAME_BYTES(spec),
        (chunk) => handle.publishVideo(chunk, spec),
      );
      const audioP = readChunks(
        runPipe("ffmpeg", buildAudioDemuxArgs(published.videoUrl)),
        PCM_CHUNK_BYTES,
        (chunk) => handle.publishAudio(new Int16Array(chunk.buffer, 0, chunk.length / 2), 48000),
      );
      inFlight = Promise.all([videoP, audioP]).then(() => {});
      await inFlight;
      inFlight = null;
    }

    async probeGeometry(videoUrl: string): Promise<{ width: number; height: number }> {
      return probe(videoUrl);
    }

    async unpublishAudio(): Promise<void> {
      if (!audioUp) return;
      audioUp = false;
      await handle.unpublishAudio();
    }

    // camera dark, meeting-side. the next publish() brings the camera
    // back with the next render's own pixels.
    async unpublishVideo(): Promise<void> {
      if (!videoUp) return;
      videoUp = false;
      await handle.unpublishVideo();
    }

    async idle(): Promise<void> {
      // nothing to do between turns: the last clip's last frame stays
      // up in the room, which is her standing there
    }

    async close(): Promise<void> {
      await handle.close();
    }
  })() as LkPublisher;
}

// extends the handoff seam with the legs the stream session needs
export interface LkPublisher extends RoomPublisher {
  unpublishAudio(): Promise<void>;
  unpublishVideo(): Promise<void>;
  close(): Promise<void>;
  probeGeometry(videoUrl: string): Promise<{ width: number; height: number }>;
}
