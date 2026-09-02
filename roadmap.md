# prixie roadmap

## current state (sept 2026)

### working
- zoom, google meet, teams meeting bots via recall.ai
- google calendar sync (automatic meeting discovery)
- real-time keyword detection in live transcript
- real-time chat monitoring (links, google forms, codes)
- post-meeting full transcript with hybrid diarization
- zoom breakout room support (auto-accept invites)
- delayed join (configurable, default 2 min after start)
- profile/persona system (sandboxed identity per context)
- camera off, mic off by default
- standalone portable backend (hono + supabase)
- frontend config dashboard (react + tanstack router + tailwind v4)
- browserbase fallback for discord, bluejeans, ringcentral (built, needs testing)
- github repo: github.com/kqrla/prixie
- inbox monitoring (gmail), live links (discord+slack), forum links (reddit, discourse, mlh)
- voice agent: end of turn detection, interruption handling, mem0 context, clarification fork (custom logic built; voice barging to be delegated to Assembly.ai)
- hinglish transliteration (devanagari to latin, schwa deletion, 24/26 test match)
- luma event registration, calendly sync, multi calendar sync (google, outlook, notion, apple)
- timezone awareness (colloquial parsing)
- late join handling (waiting rooms, passwords, "join anyway")

### not yet working
- frontend not wired to real backend api (uses mock data in localStorage)
- twitch stream joining (mlh hackathons)
- voice interaction (prixie speaking questions out loud via TTS)
- memorium: persona POV system (weighted/hierarchical memory, visual GUI, sharing)


---

## phase 0: memorium (standalone, portable)

memorium is a standalone, portable persona-based memory system. see memorium.md for full design. it is NOT "a persona joining a meeting" — it is switching perspective POV, like switching accounts on a shared laptop, but instead of different people, it is different perspectives of you (student you, founder you, employee you, hobbyist you). rapid POV switching is the goal. one you, many perspectives, each with its own memory, permissions, relevance, and behavior. sandboxed by default. sharing is configurable.

### the problem

prixie is one agent with many perspectives. the "you" at a hackathon is different from the "you" at work. when you switch from employee you to hobbyist you, you need different knowledge, different tone, different questions. the POV switch is instant — same core identity, different contextual world model. employee you at 9am should not bring up what was discussed at last weekend's hackathon unless you explicitly let it.

but right now, all personas share the same flat memory. we need:

1. **identity perspective** - who this persona IS (name, voice, tone, background)
2. **memory** - what this persona knows (sandboxed, indexed, weighted, hierarchical)
3. **contextual permissions** - what this persona can ACCESS (calendars, inboxes, apis, other personas' memory)
4. **relevance** - what this persona CARES about (what to watch for, what to ask, what to capture)
5. **persona** - how this persona BEHAVES (communication style, initiative level, question format)

### two axes of memory (the core insight)

memory is not flat. every memory has two independent properties:

**weight** = how core this is to the persona's identity
- "i am a developer" = weight 0.9 (defining trait)
- "i prefer tea over coffee" = weight 0.3 (minor preference)
- "the meeting is at 3pm" = weight 0.1 (transient fact)
- high weight = this is WHO the persona is. removing it changes the identity.

**hierarchy** = how much this drives the persona's behavior and discourse
- "i am a developer" = hierarchy 0.7 (comes up often, influences what to ask)
- "i prefer tea over coffee" = hierarchy 0.1 (rarely relevant, rarely mentioned)
- "i care deeply about accessibility" = weight 0.8, hierarchy 0.3 (core identity but passive - doesn't drive most conversations)
- "the hackathon deadline is friday" = weight 0.2, hierarchy 0.9 (not core to identity but drives urgent behavior)

these are DIFFERENT axes. something can be:
- high weight + high hierarchy: "i am a student" (defines me, drives my actions constantly)
- high weight + low hierarchy: "i believe in open source" (core to who i am, but i don't bring it up unless relevant)
- low weight + high hierarchy: "the exam is tomorrow" (not part of my identity, but it's all i'm thinking about right now)
- low weight + low hierarchy: "it rained last tuesday" (not core, not driving anything)

this is memorium: identity-weighted, behavior-hierarchical, associative memory indexing. wraps mem0 (github.com/mem0ai/mem0) for vector storage and semantic search. full design in memorium.md.

### visual GUI separator

the GUI shows each persona as a distinct visual entity with clear separation:

```
+-------------------------------------------------------+
|  PERSONAS                                              |
|                                                        |
|  +-------------+    +-------------+    +-----------+  |
|  | HACKATHON   |    | WORK        |    | CLASS     |  |
|  | -------------|    | -------------|    |-----------|  |
|  | display:    |    | display:    |    | display:  |  |
|  |   karl     |    |   karl.s   |    |   karl    |  |
|  |             |    |             |    |           |  |
|  | MEMORY (12) |    | MEMORY (47) |    | MEMORY (8)|  |
|  | [weighted]  |    | [weighted]  |    | [weighted]|  |
|  | [hierarchy]  |    | [hierarchy]  |    | [hierarchy]  |
|  |             |    |             |    |           |  |
|  | ACCESS:     |    | ACCESS:     |    | ACCESS:   |  |
|  | [x] discord  |    | [x] work cal |    | [x] class  |
|  | [x] mlh.io  |    | [x] workmail |    | [x] campus  |
|  | [ ] gmail    |    | [x] slack   |    | [ ] gmail  |
|  |             |    |             |    |           |  |
|  | QUESTIONS:  |    | QUESTIONS:  |    | QUESTIONS:|  |
|  | 3 pending   |    | 7 pending   |    | 2 pending |  |
|  +-------------+    +-------------+    +-----------+   |
|                                                        |
|  SHARING:  hackathon -> work (one-way: project links)   |
|            class -> hackathon (one-way: deadline info)  |
|            [no sharing by default]                       |
+-------------------------------------------------------+
```

each persona card shows:
- identity (display name, avatar, tone description)
- memory count with weight/hierarchy visualization
- contextual permissions (what sources it can access)
- pending questions / capture requests
- sharing rules (what flows to/from other personas)

memory visualization within a persona:
```
HACKATHON PERSONA > MEMORY

  WEIGHT (identity core)           HIERARCHY (behavior drive)
  ─────────────────────           ──────────────────────────
  [0.95] developer              │    [0.90] deadline friday
  [0.85] mlh participant         │    [0.85] project = prixie
  [0.80] team lead               │    [0.70] developer
  [0.60] competitive             │    [0.60] team lead
  [0.40] prefers dark mode       │    [0.20] competitive
  [0.20] likes pizza             │    [0.10] prefers dark mode
  [0.15] deadline friday  ←──────┼──────────────────────────
  (transient, high urgency       │    (urgent but not identity)
   but not WHO i am)             │
                                 │
  ↑ sorted by identity core      │  ↑ sorted by behavior influence
  ↑ this is WHO i am             │  ↑ this is what DRIVES my actions
```

### contextual permissions

each persona has granular access controls:

| permission | hackathon | work | class |
| --- | --- | --- | --- |
| google calendar (work) | no | yes | no |
| google calendar (personal) | yes | no | yes |
| gmail (work) | no | yes | no |
| gmail (personal) | yes | no | yes |
| discord servers | yes | no | no |
| slack workspaces | no | yes | no |
| recall.ai account | hackathon key | work key | shared key |
| browserbase | yes | yes | yes |
| luma events | yes | no | no |
| calendly | no | yes | no |

permissions are per-source, per-persona. a persona can only see meetings, capture requests, and memories from sources it has access to.

### memory sharing rules

sandboxed by default. sharing is opt-in and configurable:

**one-way flow**: persona A can read persona B's memory, but B can't read A's
```
hackathon -> work: share project links and tech stack info
  (work persona knows what you built at hackathons,
   but hackathon persona doesn't see your work meetings)
```

**bidirectional flow**: both personas can read each other's memory
```
class <-> work: share schedule info
  (both personas know your class and work schedule
   so neither double-books you)
```

**common traits**: shared identity facts across all personas
```
global: "name is karl", "timezone is EST", "prefers concise answers"
  (every persona inherits these, they're part of the global self)
```

**conditional sharing**: share only when certain conditions are met
```
hackathon -> work: share only memories tagged "portfolio" or "achievement"
  (work persona knows about your hackathon wins for resume purposes,
   but not your 3am rambling about a bug)
```

sharing is per-memory, not all-or-nothing. you can share "i won best hack" from hackathon -> work without sharing "i forgot to eat for 18 hours."

### data model

existing tables (already built):
- `profiles` - identity perspective (name, display_name, email, context, shared_memory, is_default)
- `profile_memory` - per-profile memory (key, value, category)
- `global_memory` - shared memory across all profiles

new columns on profile_memory:
- `weight` FLOAT (0-1) - how core this is to the persona's identity
- `hierarchy` FLOAT (0-1) - how much this drives the persona's behavior
- `tags` TEXT[] - tags for conditional sharing (e.g. ["portfolio", "achievement"])
- `source` TEXT - where this memory came from (transcript, user_input, inference, shared)
- `confidence` FLOAT (0-1) - how confident we are this memory is accurate
- `last_recalled` TIMESTAMPTZ - when was this memory last used (for decay)
- `recall_count` INTEGER - how many times this memory was retrieved

new table: persona_permissions
- profile_id, source_type (calendar, inbox, discord, slack, luma, calendly, recall_ai), source_id, access_level (read, write, read_write)

new table: persona_sharing
- source_profile_id, target_profile_id, direction (one_way, bidirectional), condition_tags TEXT[], condition_category TEXT, active BOOLEAN

new table: persona_config
- profile_id, tone (professional, casual, curious, etc.), initiative_level (passive, active, proactive), question_style (direct, indirect, socratic), voice_id (for TTS), language_preference

### memory indexing and retrieval

when prixie processes a transcript or needs to recall something:

1. **indexing**: new facts from a meeting are extracted and stored with:
   - initial weight (based on how often it's mentioned / how central it seems)
   - initial hierarchy (based on urgency and action-orientation)
   - tags (for sharing rules)
   - source meeting_id + profile_id

2. **retrieval**: when prixie needs to recall something for a question:
   - search by semantic similarity (mem0 vector search)
   - boost by hierarchy (high-hierarchy memories surface first)
   - filter by weight threshold (for identity-sensitive questions, only use high-weight memories)
   - filter by permissions (only memories this persona has access to)
   - decay: memories not recalled recently have slightly reduced hierarchy (not weight - identity doesn't decay)

3. **decay rules**:
   - weight (identity) does NOT decay - you don't stop being a developer because you haven't mentioned it
   - hierarchy (behavior drive) decays slowly - "deadline friday" stops driving behavior after friday
   - recall_count reinforces both axes - frequently used memories strengthen
   - confidence adjusts with corroboration - if multiple sources confirm a fact, confidence goes up

### persona in meetings

when a persona joins a meeting:
1. loads identity perspective (name, display name, tone)
2. loads persona_config (how to behave, what voice to use, initiative level)
3. loads contextual permissions (what sources to check for this meeting)
4. loads relevant memory (filtered by hierarchy + permissions)
5. loads pending questions / capture requests assigned to this persona
6. joins the meeting as THIS persona, not as a generic agent

during the meeting:
7. new facts are indexed with the current persona's identity and permissions
8. memories are recalled with weight/hierarchy boosting
9. questions are asked in the persona's voice and style
10. captured items are tagged with the persona's context for later retrieval

after the meeting:
11. transcript is processed and indexed into persona memory
12. captured items are stored with persona tags
13. sharing rules determine what (if anything) flows to other personas
14. memory weights and hierarchies are adjusted based on what was discussed

### implementation phases

**0a. data model** (schema update)
- add weight, hierarchy, tags, source, confidence, last_recalled, recall_count to profile_memory
- create persona_permissions, persona_sharing, persona_config tables
- update supabase_schema.sql

**0b. memory engine**
- build memory indexing service (extract facts from transcripts, assign weight/hierarchy)
- build memory retrieval service (semantic search + hierarchy boost + weight filter)
- build memory decay service (periodic hierarchy decay, recall reinforcement)
- integrate with mem0 for vector storage and semantic search

**0c. persona management API**
- CRUD for persona_config (tone, initiative, question style, voice, language)
- CRUD for persona_permissions (grant/revoke access to sources)
- CRUD for persona_sharing (configure one-way, bidirectional, conditional sharing)
- assign meetings to personas (meeting.profile_id already exists)

**0d. visual GUI separator**
- persona cards with identity, memory stats, access, pending questions
- memory explorer (view all memories for a persona, sorted by weight or hierarchy)
- permissions matrix (grid of personas x sources with toggle)
- sharing configuration (visual flow diagram between persona cards)
- drag-and-drop meeting assignment to perspectives (POV switching)
- memory weight/hierarchy sliders for manual adjustment

**0e. persona assignment on deploy**
- when deploying to a meeting, select which persona attends
- the deploy form shows available personas and their capabilities
- each persona loads only its own memory, permissions, and config
- the bot joins the meeting AS that persona

---

## phase 1: link sourcing and discovery

how prixie finds the meeting link from anywhere.

### 1a. calendar (working)
- google calendar sync via recall.ai connector
- automatically creates meeting records when events change
- extracts meeting URLs from event location/conference data

### 1b. multi calendar sync (in progress)
- google calendar (working)
- microsoft outlook calendar (via ms graph api)
- notion calendar (via notion api database query)
- apple calendar (via caldav)
- unified sync produces MeetingCandidate records regardless of source
- all sources use the same extractMeetingUrl + detectPlatform utilities

### 1c. calendly (in progress)
- sync calendly scheduled events to meeting records
- webhook handler for real-time event creation
- extracts meeting url from calendly event location

### 1d. luma event registration (in progress)
- search for events by query
- register for events using profile identity
- captures meeting link from registration confirmation
- auto-creates meeting record with correct platform detection
- supports multiple luma accounts (one per profile)

### 1e. inbox monitoring (built)
- monitor gmail for meeting links in emails
- parse email body for zoom/google meet/teams/join links
- match to calendar events or create standalone meeting records
- auto-creates meeting records from discovered links

### 1f. discord and slack live links (built)
- monitor discord channels via bot api for meeting links
- monitor slack channels via bot api for meeting links
- auto-creates meeting records (join_delay=0 for live links)
- batch scan multiple channels

### 1g. forum and community links (built)
- reddit: scan subreddit posts for meeting links
- discourse: scan forum topics and posts
- mlh.io: scan mlh hackathon season page
- generic web pages: scan any url for meeting links
- auto-creates meeting records from forum links

---

## phase 2: platform expansion

### recall.ai supported
| platform | recall.ai | chat | transcript | breakout rooms | status |
| --- | --- | --- | --- | --- | --- |
| zoom | yes full | send + receive | yes | yes | working |
| google meet | yes full | send + receive | yes | n/a | working |
| microsoft teams | yes full | send + receive | yes | n/a | working |
| slack huddles | yes limited | send only | yes | n/a | enable + test |
| cisco webex | yes partial | no chat | yes | n/a | enable + test |

### browserbase fallback
| platform | recall.ai | browserbase approach | status |
| --- | --- | --- | --- |
| discord | no | open discord in browser, join voice channel | built, needs testing |
| bluejeans | no | open bluejeans link, join meeting | built, needs testing |
| ringcentral | no | open ringcentral link, join from browser | built, needs testing |
| twitch | no | open stream url, dismiss popups, capture audio | planned |
| any url | no | generic: open URL, find join button, capture audio | built |

### late join handling
when prixie arrives after the meeting has already started:
- handles "meeting has already started" prompts (clicks "join anyway")
- handles password prompts (extracts password from URL if present)
- handles waiting rooms (waits up to 10 minutes for host to admit)
- handles name entry prompts
- detects if already auto-joined (checks for mute/unmute UI)
- works with both recall.ai (just creates the bot late) and browserbase (navigates and joins late)

---

## phase 3: timezone awareness (built)

prixie understands colloquial timezone references:
- "3pm est" -> America/New_York
- "tomorrow at 9am pacific" -> America/Los_Angeles
- "friday 6pm ist" -> Asia/Kolkata
- "in 2 hours" -> relative time
- "monday at 10am london time" -> Europe/London
- city names: "nyc", "la", "sf", "mumbai", "tokyo", "sydney", "berlin", etc.
- abbreviation aliases: est, pst, ist, gmt, cet, jst, etc.

all parsed times are converted to UTC for storage. the user's timezone preference is used for display.

---

## phase 4: stream joining (future)

### twitch
for mlh hackathons and other live-streamed events:
1. prixie opens the twitch stream URL in a browserbase session
2. dismisses mature content warnings
3. dismisses login popups
4. captures audio from the stream
5. streams audio to assembly.ai for transcription
6. monitors transcript for keywords (hackathon rules, deadlines, prizes, access codes)
7. captures any links mentioned or shown on screen
8. returns transcript + captured items when the stream ends

### youtube live
- similar approach via browserbase
- capture audio from the youtube live stream
- same keyword detection pipeline

---

## phase 5: voice interaction

prixie speaks. prixie listens. prixie asks your questions out loud.

### architecture
1. real-time transcript handler detects organizer saying "any questions?" or opening q&a
2. prixie checks: any pre-specified questions not yet answered?
3. if yes -> turn on mic (mic_off = false)
4. prixie uses TTS (speechify or vapi) to speak the question
5. recall.ai "output speech/audio from bot" or browserbase audio injection
6. listens to the answer (real-time transcript continues)
7. if answer unclear -> follow up with a clarifying question
8. captures the full q&a exchange
9. turns mic back off

### end of turn detection (built)
the pacing problem: someone says "okay so basically to explain that..." then pauses while presenting their screen. prixie must NOT barge in.

multi-signal detection:
- silence threshold (3s normal, 8s if screen sharing)
- filler word detection ("uhh", "umm", "let me" = still thinking)
- screen share + cursor activity (active = setup, not done)
- sentence completeness (no terminal punctuation = mid-thought)
- transcript activity (still flowing = still talking)
- speech rate drop (was fast then slowed = wrapping up)

test result: screen share + filler + cursor activity = prixie stays quiet. correct.

### interruption handling (built)
- direct question asked -> stop immediately, yield
- organizer speaking -> stop, yield to organizer
- prixie at 90%+ speech -> finish the sentence
- prixie at <30% speech -> restart later
- mid-speech interruption -> pause, let them finish, resume

### clarification fork with mem0 (built)
- high confidence (0.85+) -> accept answer
- keyword match + moderate confidence -> accept
- short/vague answer -> ask follow-up
- hedging language ("maybe", "i think") with low confidence -> ask to confirm
- max 2 clarifications per question, then accept best answer
- mem0 stores Q&A pairs for cross-turn context

### providers
- assembly.ai: primary transcription + voice activity detection + end of turn + interruption detection (handles voice barging, silence vs pacing, turn-taking)
- speechmatics: STT for non-english/hinglish
- speechify: TTS for natural voice output
- vapi: full conversational voice agent
- mem0: persistent memory layer (wrapped by memorium)


---

## phase 6: social calling + phone (future)

prixie joins calls that aren't meetings. social platform calls, audio spaces, and regular phone calls. the meeting proxy concept extended to everywhere people actually talk.

### instagram calls

instagram doesn't have a public API for joining calls. the approach:

1. prixie opens instagram in a browserbase session (or the instagram desktop app via browser automation)
2. navigates to the DM thread where the call is happening
3. clicks "join call" (browser automation handles the UI)
4. captures tab audio via media capture API
5. streams audio to assembly.ai for transcription
6. same keyword detection + capture pipeline runs on top
7. when the call ends, returns transcript + captured items

challenges:
- instagram web doesn't support video calls in all browsers — may need mobile emulation
- auth: prixie needs to be logged into instagram (session cookies or credentials)
- instagram may detect and block automated sessions — need human-like behavior patterns
- no official API means this is fragile and may break on UI changes

alternative: if meta opens a calling API (whatsapp business API already exists for messaging), use that instead. until then, browser automation is the only path.

### twitter / x spaces

twitter spaces are public audio conversations. no join API, but they're browser-accessible.

1. prixie opens the spaces URL in a browserbase session
2. clicks "join space" (handles any login/auth prompts)
3. captures audio from the browser tab
4. streams to assembly.ai for transcription
5. keyword detection runs on the transcript
6. captures links shared in the space, speaker names, key quotes
7. returns transcript + captured items when the space ends

challenges:
- spaces can run for hours — need to handle long sessions efficiently
- speaker identification is harder (twitter doesn't expose per-speaker audio streams)
- some spaces require twitter login to join
- spaces can be private/limited — prixie can only join public ones

use case: monitoring industry spaces, AMAs, or community discussions for specific information without attending the full session.

### whatsapp calls

whatsapp doesn't have a calling API for joining calls. two approaches:

**approach 1: whatsapp web via browserbase**
1. prixie opens whatsapp web in a browserbase session
2. pairs with the user's whatsapp account (QR code, one-time setup)
3. when a call starts in a DM or group, clicks "join call"
4. captures audio via media capture API
5. streams to assembly.ai for transcription
6. same capture pipeline

challenges:
- whatsapp web calling support varies by region and browser
- whatsapp may detect automation
- one-to-one calls are private — prixie should only join group calls where the user has consent

**approach 2: whatsapp business API (if/when calling is supported)**
- whatsapp business API currently supports messaging, not calling
- if meta opens a calling endpoint, prixie would use it directly (like recall.ai for zoom)
- this is the clean path but doesn't exist yet

note: whatsapp group calls can have up to 32 participants. prixie joining a group call as a silent listener is the same proxy concept as meetings, just on a different platform.

### facetime calls

apple does not provide any API for joining facetime calls. this is the hardest platform.

**approach 1: facetime link (browser)**
- facetime supports "facetime links" — a URL anyone can open to join from a browser (chrome, edge, etc. on non-apple devices)
1. prixie opens the facetime link in a browserbase session
2. handles the "join as guest" flow (enter name, allow camera/mic)
3. captures audio via media capture API
4. streams to assembly.ai for transcription
5. same capture pipeline

challenges:
- facetime links only work if the host creates one (not all facetime calls have links)
- guest join from browser is limited — may not get per-speaker audio streams
- apple may restrict or block non-safari browsers over time
- this is the most fragile integration

**approach 2: apple device automation (local only)**
- if prixie runs on a mac, she could use apple automation (appleScript, shortcuts) to join facetime calls directly in the facetime app
- this gives better audio quality and native integration
- but: requires a mac running locally (breaks the "your device doesn't need to be on" principle)
- only viable as a self-hosted option

### regular calls (phone calls)

prixie joins regular phone calls — actual phone numbers, not app-based meetings. this is where call-e.com and livekit come in.

**call-e (call-e.com / github.com/CALLE-AI)**

call-e is an AI phone call agent. it's goal-driven, not scripted — you describe a goal ("confirm tomorrow's appointment") and it handles the full call lifecycle: planning, dialing, live conversation, adapting, and returning structured results.

- call-e is not fully open source (the core service is hosted), but it has open SDKs, MCP integrations, and an open integrations repo (github.com/CALLE-AI/call-e-integrations)
- SDK available in typescript and python
- handles: outbound dialing, IVR navigation, voicemail, call screening, hold, transfers, interruptions
- returns: structured results, transcripts, summaries
- new users get 20 free calls

prixie integration:
1. user creates a "phone call" capture request with a phone number + goal
2. prixie calls call-e via SDK: `client.calls.createAndWait({ task: "Call +15550123456 and confirm tomorrow's 9am appointment." })`
3. call-e handles the entire call
4. prixie receives the structured result (transcript, summary, outcome)
5. captured items are stored in memorium under the active persona

this is the clean path for phone calls. call-e handles the telephony, the conversation, and the adaptation. prixie just sets the goal and processes the result.

**livekit (github.com/livekit/livekit)**

livekit is genuinely open source — a WebRTC-based real-time audio/video platform. self-hostable, no vendor lock-in. it's the infrastructure layer, not an agent layer.

use cases in prixie:
1. **self-hosted calling**: prixie can join livekit rooms directly via the livekit SDK. no third-party API needed. you host the livekit server, prixie connects as a participant.
2. **voice agent infrastructure**: livekit's agent framework can be used to build prixie's voice interaction (speaking questions out loud, hearing answers) — this is an alternative to vapi/speechify for phase 5
3. **custom meeting rooms**: if you want prixie to join calls on your own infrastructure (not zoom, not google meet, just your own WebRTC rooms), livekit is the backend
4. **call recording + transcription**: livekit can capture per-participant audio streams (like recall.ai but self-hosted), which can be piped to assembly.ai

prixie integration:
1. prixie detects a livekit room URL (from calendar, link sourcing, or direct input)
2. prixie joins the livekit room as a participant via livekit SDK (camera off, mic off)
3. livekit provides per-participant audio tracks
4. audio is streamed to assembly.ai for transcription
5. same keyword detection + capture pipeline
6. when the call ends, transcript + captured items are returned

why both:
- **call-e** handles outbound phone calls to real phone numbers (the PSTN world). livekit doesn't do this directly — it's WebRTC, not telephony.
- **livekit** handles real-time audio/video rooms (the WebRTC world). call-e is a hosted agent service, not infrastructure.
- together: call-e for "prixie calls a phone number" and livekit for "prixie joins a WebRTC room on your own infrastructure"

### platform summary (phase 6)

| platform | method | calls | transcript | capture | status |
| --- | --- | --- | --- | --- | --- |
| instagram | browserbase | browser join | yes (assembly.ai) | yes | planned (fragile, no API) |
| twitter/x spaces | browserbase | browser join | yes (assembly.ai) | yes | planned |
| whatsapp | browserbase (web) or business API | browser join | yes (assembly.ai) | yes | planned (no calling API yet) |
| facetime | browserbase (link) or local mac automation | browser join or native | yes (assembly.ai) | yes | planned (most fragile) |
| phone calls (PSTN) | call-e SDK | outbound dial | yes (call-e) | yes (structured result) | planned |
| custom WebRTC rooms | livekit SDK | SDK join | yes (assembly.ai or livekit) | yes | planned |

all of these are browserbase-first (or SDK-first for call-e/livekit) since none have official "join as a bot" APIs like recall.ai provides for zoom/meet/teams. the capture pipeline (keyword detection, link grabbing, transcript with diarization) is shared across all platforms — only the join method changes.
