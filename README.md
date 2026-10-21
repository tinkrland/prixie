# voice

voice (renamed from yap) is prixie's mouth. the voice side of the proxy, decoupled from the meeting join engine (that lives on main) so it can grow at its own pace.

today prixie sits in meetings silently: she listens, watches the chat, takes notes. voice is the layer that lets her speak. when the floor opens she asks your prepared questions out loud, hears the answer, and knows when to shut up and when to press.

she speaks seamlessly in a call she is already in: the join engine (main) put her in the meeting; voice mints a livekit token for that session's own room under the identity she already holds there, so her audio comes out of the person the room already knows. a new person never requests into the call, because voice is not a person: it is her mouth on the connection she already has. a fresh identity is only ever minted for standalone voice-only spaces.

three pieces:

1. **livekit** (open source, github.com/livekit/livekit) moves the audio. prixie joins a livekit room as a participant, publishes her TTS, subscribes to everyone else. no proprietary middleman between her and the call.

2. **retelldb** for context, now vendored in this branch and reoriented from documentation retrieval to persona memory. what she should know before she opens her mouth: who she is right now (the persona's voice profile), the meeting's topic, the questions she was sent to ask. every persona gets its own isolated memory graph, plus one shared graph for global facts. a persona's facts never leak into another persona's head.

3. **mem0** (open source, github.com/mem0ai/mem0) for conversation memory. what was already said earlier in the call and in past calls, so she does not repeat a question that was answered ten minutes ago. the oss js sdk (`mem0ai/oss`) exposes exactly the two calls voice needs: `add(messages, { userId })` and `search(query, { userId })`, with `infer` on so it extracts the facts itself.

4. **obs + twitch, ours** — the obs-websocket 5.x bridge (server/obs.ts, vendored from the video branch, tests in tests/obs_test.ts). obs runs the streamer's scenes; streaming to twitch is obs's stream key plus our toggle. no masky in the path: masky's native twitch/OBS integration exists, but a streamer's setup is their set of scenes and the bridge to it should be ours.

status: retelldb vendored and working (ingest, query, voice profiles; 17 tests and the eval suite green). the seamless join is WIRED (the owner, oct 21 2026): server/room.ts mints the session token (own room, own identity) and hands off to server/audio_transport.ts, the livekit rtc-node transport behind an injectable RtcFactory: publish tts as mono pcm frames, subscribe to remote frames for stt, close on meeting end. the sdk loads lazily, so a deployment without the native bindings fails at connect time with a clear error instead of at import. mem0's seam stays in design.md.

the persona context (retelldb/ + persona/voice_adapter.ts) is synced byte-identical from main with `sh tools/sync-context.sh`: main owns it, this branch carries the copy, so her voice profile and memories are the same everywhere.

see design.md for the full flow.
