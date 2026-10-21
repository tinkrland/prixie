// the stream session: the bridge, the room, and the camera-off handoff, tied
// into one object. this is the "everything" half of the obs bridge: obs.ts
// speaks the protocol, handoff.ts owns the protocol of never cutting a
// sentence, and stream.ts is what a streamer actually operates.
//
//   goLive()      switch to the live scene, start obs's stream (the target
//                 is whatever integrations/ last pointed obs at: twitch, kick, ...)
//   cameraOff()   the full handoff: visual dark now, voice to the sentence's
//                 end, then yap owns the voice
//   cameraOn()    the face comes back; masky owns the voice again
//   end()         stop streaming
//
// nothing here posts, captions, or touches the platform account beyond obs's
// own stream key: the room and the voice are ours, the audience surface is
// obs's, and which platform that surface belongs to is one file away in
// integrations/.

import { CameraOffAdapter, type PersonaVoice, type Render } from "./handoff.ts";
import type { ObsBridge } from "../integrations/obs.ts";

// the subset of the bridge the session needs, so tests can fake it without
// speaking the obs protocol.
export interface StreamObs {
  switchScene(sceneName: string): Promise<void>;
  setSourceVisible(sceneName: string, sourceName: string, visible: boolean): Promise<void>;
  startStream(): Promise<void>;
  stopStream(): Promise<void>;
}

export interface StreamConfig {
  scene: string; // the live scene: composite source + audio
  cameraSource: string; // the masky camera source inside that scene
}

export class StreamSession {
  private adapter: CameraOffAdapter;

  constructor(
    private deps: {
      obs: StreamObs;
      config: StreamConfig;
      voice: PersonaVoice;
      // the livekit half: unpublish masky's audio after the clip ends.
      unpublishMaskyAudio(): Promise<void>;
      onFaceOff?(): Promise<void>; // fires once yap owns the voice
    },
  ) {
    this.adapter = new CameraOffAdapter({
      hideCamera: async () => {
        // the visual switch is browser-level: obs stops showing the source.
        // the clip keeps rendering; only the camera disappears.
        await this.deps.obs.setSourceVisible(this.deps.config.scene, this.deps.config.cameraSource, false);
      },
      unpublishMaskyAudio: () => this.deps.unpublishMaskyAudio(),
      onSwitched: async () => {
        await this.deps.onFaceOff?.();
      },
    });
  }

  async goLive(): Promise<void> {
    await this.deps.obs.switchScene(this.deps.config.scene);
    await this.deps.obs.startStream();
  }

  // the camera-off handoff, end to end: hide visual now, masky finishes the
  // sentence, then audio unpublishes, yap owns the voice, and she is off
  // camera from the next utterance on (runCall routes face-off turns to
  // publishFaceOff).
  async cameraOff(render: Render, clipMs: number): Promise<void> {
    await this.adapter.cameraOff(render, clipMs);
    this.deps.voice.onCamera = false;
  }

  // the face comes back: the camera source is shown again and masky owns the
  // voice from the next utterance on. the audio switch stays where it is
  // until the next turn, so this never cuts a sentence either.
  async cameraOn(): Promise<void> {
    this.deps.voice.onCamera = true;
    await this.deps.obs.setSourceVisible(this.deps.config.scene, this.deps.config.cameraSource, true);
  }

  async end(): Promise<void> {
    await this.deps.obs.stopStream();
  }
}
