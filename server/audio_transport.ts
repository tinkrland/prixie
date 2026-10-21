// the livekit audio transport for the voice branch (the owner, oct 21 2026).
//
// one seam, two honest layers:
//   - the flow (connect under the existing identity, publish TTS, subscribe
//     for STT, close when the meeting ends) is fixed and tested here with
//     fakes.
//   - the rtc-node implementation sits behind RtcFactory and imports the
//     sdk LAZILY: the native bindings only load when a real transport is
//     actually requested, so a deployment without them fails at connect
//     time with a clear error instead of breaking module load.
//
// pcm in and out: TTS arrives as Int16 mono frames, STT leaves the same
// way. the models on either side (yap, assembly.ai) work on pcm; the
// transport never transcodes.

export interface AudioFrameData {
  pcm: Int16Array;
  sampleRate: number; // 48000
  channels: number; // 1
}

export interface VoiceRoom {
  // publish one TTS frame into the room as the person already in it
  publishTts(frame: AudioFrameData): Promise<void>;
  // every remote audio frame, with the speaker, for STT
  onRemoteAudio(cb: (frame: AudioFrameData, participant: string) => void): void;
  // connected state, honestly reported
  connected(): boolean;
  // leave without leaving the call broken
  close(): Promise<void>;
}

export interface RtcFactory {
  connect(url: string, token: string): Promise<VoiceRoom>;
}

// the default factory: real rtc-node, loaded on demand.
export function defaultRtcFactory(): RtcFactory {
  return {
    async connect(url: string, token: string): Promise<VoiceRoom> {
      let rtc: any;
      try {
        // lazy: the native bindings load only when voice actually speaks
        rtc = await import("npm:@livekit/rtc-node@2");
      } catch (e) {
        throw new Error(
          `voice: the livekit rtc-node sdk could not load (native bindings missing?): ${e instanceof Error ? e.message : e}`,
        );
      }

      const room = new rtc.Room({ adaptiveStream: false, dynacast: false });
      await room.connect(url, token);

      // publish: an audio source she speaks into
      const source = new rtc.AudioSource(48000, 1);
      const track = new rtc.LocalAudioTrack(source);
      await room.localParticipant.publishTrack(track, { name: "prixie voice" });

      // subscribe: every remote frame, tagged with its speaker
      const listeners: Array<(frame: AudioFrameData, participant: string) => void> = [];
      const streams = new Map(); // trackSid -> AudioStream, closed on disconnect
      room.on(rtc.RoomEvent.TrackSubscribed, (remoteTrack: any, pub: any, participant: any) => {
        if (remoteTrack.kind !== "audio") return;
        const stream = new rtc.AudioStream(remoteTrack);
        streams.set(pub.trackSid, stream);
        stream.on(rtc.AudioStreamEvent.FrameReceived, (frame: any) => {
          const data: AudioFrameData = {
            pcm: new Int16Array(frame.data.buffer.slice(frame.data.byteOffset, frame.data.byteOffset + frame.data.byteLength)),
            sampleRate: frame.sampleRate,
            channels: frame.channels,
          };
          for (const cb of listeners) cb(data, participant.identity);
        });
      });
      room.on(rtc.RoomEvent.TrackUnsubscribed, (_remoteTrack: any, pub: any) => {
        streams.get(pub.trackSid)?.close?.();
        streams.delete(pub.trackSid);
      });

      return {
        async publishTts(frame: AudioFrameData): Promise<void> {
          if (frame.channels !== 1) {
            throw new Error(`voice: tts frames must be mono, got ${frame.channels} channels`);
          }
          await source.captureFrame(
            new rtc.AudioFrame(frame.pcm, frame.sampleRate, frame.channels, frame.pcm.length),
          );
        },
        onRemoteAudio(cb): void {
          listeners.push(cb);
        },
        connected(): boolean {
          return room.isConnected;
        },
        async close(): Promise<void> {
          for (const stream of streams.values()) stream.close?.();
          streams.clear();
          await room.disconnect();
        },
      };
    },
  };
}

// convenience: a mono 48k frame from a raw Int16 buffer, the shape the
// tts side produces. the count comes from the data, never a guess.
export function monoFrame(pcm: Int16Array, sampleRate = 48000): AudioFrameData {
  return { pcm, sampleRate, channels: 1 };
}
