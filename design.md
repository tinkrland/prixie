# yap design

## the loop

```
meeting floor opens (transcript keyword or scheduled moment)
        |
retelldb: pull context (persona profile, persona memory, prepared questions)
        |
mem0: pull conversation memory (what was already asked/answered)
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

vendored in this branch at `retelldb/`, reoriented from docs to persona memory. before speaking, prixie pulls:

- **the persona's voice profile** via `GET /v1/profile/{persona_id}` (or `client.load_profile`): three layers, lingvist (languages, code-switching), lexica (slang, fillers, hedges), lingvica (register per medium, tone defaults, punctuation-as-tone). voice mode reads `register_for("voice")`.
- **the persona's memory** via `POST /v1/query` with `persona_id`: facts, preferences, relationships, events, skills. tag-signal queries traverse the tag graph, vague ones fall back to vector similarity. her own graph plus the shared graph only: no cross-persona leakage, ever.
- **prepared questions** stay in main's CaptureRequest table; yap queries them by meeting id and feeds them into the loop.

memory files land in the right head automatically: the file's frontmatter `persona:` field wins over any caller argument, so an ingest mistake cannot put a memory in the wrong graph.

run it: `retelldb serve` (fastapi on :8000), or embedded via `RetellDB(use_memory=True)`. falkordb + pgvector for production (compose file at the repo root), hermetic in-memory backend for dev, token-projection fallback when no embedding key is set.

evals: `PYTHONPATH=. python3 evals/run_evals.py` covers tag traversal, vector fallback, persona routing, and isolation. current run: hit 100%, path accuracy 100%, persona routing 100%.

### mem0 (conversation memory)

the oss js sdk surface yap builds against:

```js
import { Memory } from "mem0ai/oss";

const memory = new Memory();

// after each exchange, additive (never overwrites)
await memory.add(
  [{ role: "user", content: "any questions about the pricing?" },
   { role: "assistant", content: "asked, professor chen said the lab code comes friday" }],
  { userId: `prixie-meeting-${meetingId}`, metadata: { persona_id } }
);

// before speaking: has this already been answered?
const prior = await memory.search("pricing question", { userId: `prixie-meeting-${meetingId}` });
```

- `infer` stays on (default): mem0 extracts the facts itself, resolves pronouns against earlier turns automatically. only the new turn gets sent, never the whole history.
- scope key is the meeting: `userId: prixie-meeting-{id}` for in-call recall. past-call persona memory belongs to memorium on main, not to yap. yap owns only conversational recall so the two never fight.
- `expirationDate` on in-call memories means a stale meeting's memory ages out on its own.

## open questions

- which livekit sdk surface for a headless deno bot (rtc-node vs agents framework, agents is python)
- does TTS come from speechify (credits on hand) or assembly.ai's streaming voice
