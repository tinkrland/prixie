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
  assertEquals(plan.voiceSwitch, { atMs: 4000, to: "voice" });
  assertEquals(voice.onCamera, false); // face-off turns route to voice next
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

Deno.test("the flip: a call starts as a voice call, face is opt-in", async () => {
  const voice = fakeVoice();
  voice.onCamera = false; // the persona default since the flip
  const { publisher, log } = fakePublisher();
  const spoken: string[] = [];
  const utterances: (Utterance | null)[] = [
    { text: "voice only, as most turns are" },
    { text: "still voice" },
    null,
  ];
  let i = 0;
  const call = callSession({
    voice,
    publisher,
    hear: async () => utterances[i++],
    faceOff: async (u) => {
      spoken.push(u.text); // the livekit audio leg, caller-owned
    },
    timer: fakeTimer({ now: 0 }),
  });

  await call.run();
  // every turn went out as voice: nothing rendered, nothing published
  assertEquals(spoken, ["voice only, as most turns are", "still voice"]);
  assertEquals(log, []);

  // the camera comes on: the NEXT utterance renders through masky, as the
  // pair the room hears and sees from one turn
  call.cameraOn();
  assertEquals(voice.onCamera, true);
  const heard: (Utterance | null)[] = [{ text: "now you see me" }, null];
  let j = 0;
  const call2 = callSession({
    voice,
    publisher,
    hear: async () => heard[j++],
    faceOff: async (u) => {
      spoken.push(u.text);
    },
    timer: fakeTimer({ now: 0 }),
  });
  await call2.run();
  assertEquals(log, ["publish a-now you see me.mp3 | v-now you see me.mp4"]);
  assertEquals(spoken.length, 2); // the on-camera turn never doubled up
});

Deno.test("off camera: face-off turns go to the voice leg, not the camera", async () => {
  const voice = fakeVoice();
  const { publisher, log } = fakePublisher();
  const faceOff: string[] = [];
  const utterances: (Utterance | null)[] = [{ text: "off camera line" }, null];
  let i = 0;
  voice.onCamera = false;
  const call = callSession({
    voice,
    publisher,
    hear: async () => utterances[i++],
    // since the flip the voice leg is a call-level dep (like hear), never a
    // method on the livekit publisher: lk_publisher has no tts to call
    faceOff: async (u) => {
      faceOff.push(u.text);
    },
  });
  await call.run();
  assertEquals(faceOff, ["off camera line"]);
  assertEquals(log, []); // nothing was rendered on camera: the voice leg owned it
});
