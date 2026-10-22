// call compose tests: the orchestration half, with unit fakes behind the
// seams. no test here claims masky answered or rtc loaded; what they prove
// is the wiring: say -> publish on one render, the camera-off handoff in
// order, and the compose's own continuity (the same render reaches both
// legs).

import { assertEquals } from "jsr:@std/assert";
import { callSession, type CallSessionDeps } from "../server/call.ts";
import type { LkPublisher } from "../server/lk_publisher.ts";
import type { PersonaVoice, Render, Utterance } from "../server/handoff.ts";

// a fake voice: says each utterance as a render whose urls carry the text
function fakeVoice() {
  const said: Utterance[] = [];
  const voice = {
    onCamera: true,
    async say(utterance: Utterance): Promise<Render> {
      said.push(utterance);
      return {
        turnId: `t${said.length}`,
        audioUrl: `a-${utterance.text}.mp3`,
        videoUrl: `v-${utterance.text}.mp4`,
        turnLiveUrl: "",
        fromSpeakCache: false,
        elapsedMs: 10,
      };
    },
    recall: () => [],
    scene: () => "",
    said,
  };
  return voice as unknown as PersonaVoice & { said: Utterance[] };
}

// a fake publisher: records what reached the room, clock-free
function fakePublisher() {
  const log: string[] = [];
  const publisher: LkPublisher = {
    async publish(p) {
      log.push(`publish ${p.audioUrl} | ${p.videoUrl}`);
    },
    async unpublishAudio() {
      log.push("audio unpublish");
    },
    async unpublishVideo() {
      log.push("video unpublish");
    },
    async close() {
      log.push("close");
    },
    async probeGeometry() {
      return { width: 2, height: 2 };
    },
  };
  return { publisher, log };
}

function fakeTimer(clockMs: { now: number }) {
  return {
    async sleep(ms: number) {
      clockMs.now += ms;
    },
  };
}

Deno.test("run: one render per utterance, same urls on both legs", async () => {
  const voice = fakeVoice();
  const { publisher, log } = fakePublisher();
  const utterances: (Utterance | null)[] = [
    { text: "hello" },
    { text: "she says her own words" },
    null,
  ];
  let i = 0;
  const deps: CallSessionDeps = { voice, publisher, hear: async () => utterances[i++] };
  const call = callSession(deps);
  await call.run();
  // the same render's urls reached the room together, twice, then idle
  assertEquals(log, [
    "publish a-hello.mp3 | v-hello.mp4",
    "publish a-she says her own words.mp3 | v-she says her own words.mp4",
  ]);
});

Deno.test("cameraOff: dark now, audio to the sentence's end, then off camera", async () => {
  const voice = fakeVoice();
  const { publisher, log } = fakePublisher();
  const clock = { now: 0 };
  const call = callSession({ voice, publisher, hear: async () => null, timer: fakeTimer(clock) });
  const render = await (voice as any).say({ text: "one sentence" });

  const plan = await call.cameraOff(render, 4000);

  // order is the protocol: visual dark, clip plays out, audio unpublishes
  assertEquals(log, ["video unpublish", "audio unpublish"]);
  assertEquals(clock.now, 4000); // the sleep IS the sentence's end
  assertEquals(plan.cutMidSentence, false);
  assertEquals(plan.voiceSwitch, { atMs: 4000, to: "yap" });
  assertEquals(voice.onCamera, false); // face-off turns route to yap next
});

Deno.test("cameraOn: back on camera; end closes the room", async () => {
  const voice = fakeVoice();
  const { publisher, log } = fakePublisher();
  const call = callSession({ voice, publisher, hear: async () => null, timer: fakeTimer({ now: 0 }) });
  call.cameraOn();
  assertEquals(voice.onCamera, true);
  await call.end();
  assertEquals(log, ["close"]);
});

Deno.test("off camera: face-off turns go to the yap leg, not the camera", async () => {
  const voice = fakeVoice();
  const { publisher, log } = fakePublisher();
  const faceOff: string[] = [];
  const publisherFaceOff = {
    ...publisher,
    async publishFaceOff(utterance: Utterance) {
      faceOff.push(utterance.text);
    },
  } as LkPublisher;
  const utterances: (Utterance | null)[] = [{ text: "off camera line" }, null];
  let i = 0;
  voice.onCamera = false;
  const call = callSession({ voice, publisher: publisherFaceOff, hear: async () => utterances[i++] });
  await call.run();
  assertEquals(faceOff, ["off camera line"]);
  assertEquals(log, []); // nothing was rendered on camera: yap owned the voice
});
