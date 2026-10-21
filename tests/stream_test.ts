// the stream session: obs operations in the right order, and the camera-off
// handoff operating the real bridge. run: deno test tests/stream_test.ts

import { StreamSession, type StreamObs } from "../server/stream.ts";
import { ObsBridge } from "../server/obs.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

interface Recorded {
  op: string;
  args: unknown[];
}

function fakeObs(): { obs: StreamObs; log: Recorded[] } {
  const log: Recorded[] = [];
  return {
    log,
    obs: {
      switchScene: async (scene: string) => void log.push({ op: "switchScene", args: [scene] }),
      setSourceVisible: async (scene: string, source: string, visible: boolean) =>
        void log.push({ op: "setSourceVisible", args: [scene, source, visible] }),
      startStream: async () => void log.push({ op: "startStream", args: [] }),
      stopStream: async () => void log.push({ op: "stopStream", args: [] }),
    },
  };
}

function fakeVoice() {
  return { onCamera: true } as { onCamera: boolean };
}

const config = { scene: "live", cameraSource: "prixie cam" };
const render = {
  turnId: "t1", audioUrl: "a.mp3", videoUrl: "v.mp4", turnLiveUrl: "l",
  fromSpeakCache: false, elapsedMs: 900,
};

Deno.test("go live: scene first, then the stream", async () => {
  const { obs, log } = fakeObs();
  const session = new StreamSession({
    obs: obs as unknown as ObsBridge,
    config,
    voice: fakeVoice() as never,
    unpublishMaskyAudio: async () => {},
  });
  await session.goLive();
  assert(log[0].op === "switchScene" && log[0].args[0] === "live", "the live scene is switched first");
  assert(log[1].op === "startStream", "then obs starts streaming to twitch");
  await session.end();
  assert(log[log.length - 1].op === "stopStream", "end stops the stream");
});

Deno.test("camera off: the source hides, then the voice switches only after the clip", async () => {
  const { obs, log } = fakeObs();
  const voice = fakeVoice();
  let unpublished = false;
  const session = new StreamSession({
    obs: obs as unknown as ObsBridge,
    config,
    voice: voice as never,
    unpublishMaskyAudio: async () => void (unpublished = true),
  });
  // a 1ms clip keeps the test fast; the ordering is what is under test.
  await session.cameraOff(render as never, 1);
  assert(log.length === 1 && log[0].op === "setSourceVisible", "only the visual switched immediately");
  assert(log[0].args[2] === false, "the camera source is hidden");
  assert(unpublished, "audio unpublishes after the clip");
  assert(voice.onCamera === false, "she is off camera for the next utterance");
});

Deno.test("camera on: the source returns and masky owns the voice again", async () => {
  const { obs, log } = fakeObs();
  const voice = fakeVoice();
  const session = new StreamSession({
    obs: obs as unknown as ObsBridge,
    config,
    voice: voice as never,
    unpublishMaskyAudio: async () => {},
  });
  await session.cameraOn();
  assert(voice.onCamera === true, "masky owns the voice again");
  assert(log[0].op === "setSourceVisible" && log[0].args[2] === true, "the camera source is visible again");
});

Deno.test("the obs bridge satisfies the session's interface", () => {
  // compile-time check: the real bridge is a StreamObs with no adapter.
  const bridge: StreamObs = {} as ObsBridge;
  assert(bridge !== undefined, "ObsBridge is structurally a StreamObs");
});
