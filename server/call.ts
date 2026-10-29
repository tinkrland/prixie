// the compose (the owner, oct 22 2026): the bridge, assembled with no
// injectables. this is the answer to "did the bridge ever run with the
// real masky and the real rtc and nothing faked between them": from
// here, PersonaVoice.init talks to the real masky api under the owner's own
// key, createLivekitPublisher loads the real rtc-node, demuxes with real
// ffmpeg, and probes with real ffprobe. nothing in this file injects a
// seam, because the seam's whole point is that tests sit BEHIND it and
// the compose sits IN FRONT of it.
//
// the continuity question, answered by construction:
//
//   voice.say(utterance)  ->  { audioUrl, videoUrl }   one masky turn
//   publisher.publish(render)                          the same render
//
// there is no step between say and publish where a second voice could
// enter. the room hears the render the mouth moves to, and no schedule
// or sync protocol exists to drift.
//
// hear() is the only thing the caller owns: it is voice's side (transcript
// -> what she says next), and inventing a default for it here would be
// inventing a fake agent. the caller passes the loop that produces
// utterances; this file only guarantees they leave as one voice.
//
// THE FLIP (the owner, oct 22 2026): the call STARTS as a livekit voice call.
// voice turns route to the caller's voice leg (faceOff, the livekit audio
// transport from the voice branch, same seam as hear: caller-owned). the
// face is opt-in: cameraOn() and the persona's avatar speaks the CLONED
// match of that same voice (PersonaInit.voiceMatch). voice call first,
// face when wanted, one voice throughout.

import {
  CameraOffAdapter,
  PersonaVoice,
  planCameraOff,
  runCall,
  type CameraOffPlan,
  type Render,
  type Timer,
  type Utterance,
} from "./handoff.ts";
import { createLivekitPublisher, type LkPublisher } from "./lk_publisher.ts";
import type { SetSpec } from "../studioify/set.ts";

// the orchestration half: the pieces are built, the wiring is what needs
// proving. voice + publisher + hear + the camera-off handoff as one call
// object. tested with unit fakes (no test claims a transport loaded);
// startLiveCall is the same wiring with every piece real.
export interface CallSessionDeps {
  voice: PersonaVoice;
  publisher: LkPublisher;
  // voice: transcript -> next utterance. null = the call is over.
  hear(): Promise<Utterance | null>;
  // the voice leg (the flip's default path): the livekit audio transport
  // from the voice branch. voice-first means most turns never render a
  // face at all; when it is absent, voice-only turns idle and the run
  // stays honest: no fake tts is invented here.
  faceOff?: (utterance: Utterance) => Promise<void>;
  timer?: Timer; // tests pass a fake clock; the default sleeps for real
}

export interface LiveCall {
  voice: PersonaVoice;
  publisher: LkPublisher;
  // the call loop: hear -> say -> publish, one voice, two rooms
  run(): Promise<void>;
  // the meeting-side camera-off handoff: no obs here, the livekit camera
  // track IS the browser-level switch. dark now, audio to the sentence's
  // end, then voice owns the voice from the next utterance on.
  cameraOff(render: Render, clipMs: number): Promise<CameraOffPlan>;
  // the face comes back with the next render (the camera track
  // republishes itself on the next publish; there is no idle face in a
  // meeting room, so this is honest: she is camera-off until she speaks)
  cameraOn(): void;
  end(): Promise<void>;
}

export function callSession(deps: CallSessionDeps): LiveCall {
  const timer = deps.timer ?? { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  const adapter = new CameraOffAdapter({
    hideCamera: async () => {
      await deps.publisher.unpublishVideo();
    },
    unpublishMaskyAudio: async () => {
      await deps.publisher.unpublishAudio();
    },
  }, timer);
  // runCall's publisher: the livekit pair on camera, the voice leg off
  // camera. the compose never invents a tts for the voice leg; the caller
  // passes the real one (the voice branch's transport).
  const runPublisher = {
    publish: (published: { audioUrl: string; videoUrl: string }) =>
      deps.publisher.publish(published),
    idle: () => deps.publisher.idle?.() ?? Promise.resolve(),
    publishFaceOff: deps.faceOff,
  };
  return {
    voice: deps.voice,
    publisher: deps.publisher,
    run: () => runCall(deps.voice, runPublisher, deps.hear),
    async cameraOff(render, clipMs) {
      const plan = await adapter.cameraOff(render, clipMs);
      deps.voice.onCamera = false;
      return plan;
    },
    cameraOn() {
      deps.voice.onCamera = true;
    },
    async end() {
      await deps.publisher.close();
    },
  };
}

// persona init, verbatim: personaRef is who she is (memory + voice
// profile), voiceId the avatar's own voice, facePrompt her look.
export interface PersonaInit {
  personaRef: string;
  facePrompt: string;
  voiceId: string;
  personalityPrompt?: string;
  avatarImageUrl?: string;
  set?: SetSpec;
  // the flip: name of the masky voice that is a clone of the CALL voice
  // (cloned in masky's web ui from livekit voice samples). when given,
  // the avatar wears it, so an on-camera face speaks the same voice the
  // room has been hearing. missing clone = hard error, never a mismatch.
  voiceMatch?: string;
}

export interface LiveCallDeps {
  persona: PersonaInit;
  // the session's OWN room and identity, minted by the caller at call
  // time (the voice branch's room rule). never a shared default.
  room: { url: string; token: string };
  hear(): Promise<Utterance | null>;
  // the voice leg: the livekit audio transport (voice branch). the call
  // starts as a voice call, so this leg carries every off-camera turn.
  faceOff?: (utterance: Utterance) => Promise<void>;
  timer?: Timer;
}

// the compose: everything real, nothing injected. this is the function
// a meeting join calls when she goes on camera.
export async function startLiveCall(deps: LiveCallDeps): Promise<LiveCall> {
  const voice = await PersonaVoice.init(deps.persona);
  const publisher = await createLivekitPublisher(deps.room);
  return callSession({
    voice,
    publisher,
    hear: deps.hear,
    faceOff: deps.faceOff,
    timer: deps.timer,
  });
}

// the plan is the protocol's own shape: re-exported so the compose's
// callers can assert the no-cut invariant without importing handoff.
export { planCameraOff };
