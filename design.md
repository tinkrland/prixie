# yap design

## the loop

```
meeting floor opens (transcript keyword or scheduled moment)
        |
retelldb: pull context (persona, topic, prepared questions)
        |
mem0: pull memory (what was already asked/answered)
        |
decide: is it worth speaking? (clarification fork)
        |
livekit: publish TTS frames (prixie speaks)
        |
assembly.ai: end of turn + barging handling
        |
she listens, waits, follows up or goes quiet
```

## pieces

### livekit (audio transport)

- server issues an access token with join + publish grants (server/room.ts)
- prixie joins the livekit room as a bot participant
- publishes TTS audio frames to the room
- subscribes to other participants' audio tracks for STT
- room lifecycle mirrors the meeting lifecycle: she leaves when the meeting ends

voice barging and interruption handling are assembly.ai's job, not custom logic. prixie must not barge in during presentation pauses ("okay so basically to explain that..." then silence while the presenter sets up). end of turn detection handles pacing vs real silence.

### retelldb (context)

before speaking, prixie needs:
- persona she is running as (tone, formality, vocabulary sliders from the voice config on main)
- the meeting topic and audience
- prepared questions and what answers she already has

integration is stubbed until the source zip lands in this branch. the seam is server/context.ts.

### mem0 (memory)

- in-call: rolling memory of questions asked and answers heard, so she never repeats or contradicts
- cross-call: persona memory from memorium (on main) stays separate. yap only owns conversational recall

## open questions

- which livekit sdk surface for a headless deno bot (rtc-node vs agents framework, agents is python)
- how retelldb's context model maps onto the persona/memory tables main already has
- does TTS come from speechify (credits on hand) or assembly.ai's streaming voice
