# yap

yap is prixie's mouth. the voice side of the proxy, decoupled from the meeting join engine (that lives on main) so it can grow at its own pace.

today prixie sits in meetings silently: she listens, watches the chat, takes notes. yap is the layer that lets her speak. when the floor opens she asks your prepared questions out loud, hears the answer, and knows when to shut up and when to press.

three pieces:

1. **livekit** (open source, github.com/livekit/livekit) moves the audio. prixie joins a livekit room as a participant, publishes her TTS, subscribes to everyone else. no proprietary middleman between her and the call.

2. **retelldb** for context, now vendored in this branch and reoriented from documentation retrieval to persona memory. what she should know before she opens her mouth: who she is right now (the persona's voice profile), the meeting's topic, the questions she was sent to ask. every persona gets its own isolated memory graph, plus one shared graph for global facts. a persona's facts never leak into another persona's head.

3. **mem0** (open source, github.com/mem0ai/mem0) for conversation memory. what was already said earlier in the call and in past calls, so she does not repeat a question that was answered ten minutes ago. the oss js sdk (`mem0ai/oss`) exposes exactly the two calls yap needs: `add(messages, { userId })` and `search(query, { userId })`, with `infer` on so it extracts the facts itself.

status: retelldb vendored and working (ingest, query, voice profiles; 17 tests and the eval suite green). livekit session flow outlined, mem0 seam specified in design.md, both next to wire.

see design.md for the full flow.
