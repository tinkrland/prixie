# yap

yap is prixie's mouth. the voice side of the proxy, decoupled from the meeting join engine (that lives on main) so it can grow at its own pace.

today prixie sits in meetings silently: she listens, watches the chat, takes notes. yap is the layer that lets her speak. when the floor opens she asks your prepared questions out loud, hears the answer, and knows when to shut up and when to press.

three pieces:

1. **livekit** (open source, github.com/livekit/livekit) moves the audio. prixie joins a livekit room as a participant, publishes her TTS, subscribes to everyone else. no proprietary middleman between her and the call.

2. **retelldb** for context. what she should know before she opens her mouth: the meeting's topic, the persona she is running as, the questions she was sent to ask. integration pending: source zip to be added, then wired in.

3. **mem0** (open source, github.com/mem0ai/mem0) for memory. what was already said earlier in the call and in past calls, so she does not repeat a question that was answered ten minutes ago.

status: scaffold. livekit session flow outlined, retelldb and mem0 integration points stubbed and waiting on the source zip.

see design.md for the full flow.
