# prixie roadmap

## current state (sept 2026)

### working
- zoom, google meet, teams meeting bots via recall.ai
- google calendar sync (automatic meeting discovery)
- real-time keyword detection in live transcript
- real-time chat monitoring (links, google forms, codes)
- post-meeting full transcript with hybrid diarization (speaker differentiation)
- zoom breakout room support (auto-accept invites)
- delayed join (configurable, default 2 min after start)
- profile/persona system (sandboxed identity per context)
- camera off, mic off by default
- standalone portable backend (hono + supabase, zero platform lock-in)
- frontend config dashboard (tanstack start + react)
- github repo: github.com/kqrla/prixie

### not yet working
- frontend not wired to real backend api (uses mock data in localStorage)
- meeting link sourcing beyond google calendar
- platforms outside recall.ai's support (discord, bluejeans, ringcentral)
- voice interaction (prixie speaking questions out loud)
- hinglish transliteration
- luma event registration

---

## phase 1: link sourcing & discovery

how prixie finds the meeting link — not just from calendar, but from anywhere.

### 1a. calendar (done)
- google calendar sync via recall.ai connector
- automatically creates meeting records when events change
- extracts meeting URLs from event location/conference data

### 1b. inbox monitoring (planned)
- monitor gmail for meeting links in emails
- parse email body for zoom/google meet/teams/join links
- match to calendar events or create standalone meeting records
- support multiple inboxes (one per profile/persona)
- use gmail connector for read-only email scanning

### 1c. discord & slack live links (planned)
- monitor discord channels and slack channels for meeting links
- "call starting in #general: https://zoom.us/j/..." 
- links sent live during an event period (hackathon, webinar, etc.)
- requires discord bot token + slack bot token
- prixie watches specific channels the user designates
- when a meeting link appears, prixie deploys automatically based on the user's instruction

### 1d. luma event registration (planned)
- integrate with luma.com api for event registration
- prixie registers for events the user specifies
- captures the meeting link from the registration confirmation
- supports multiple luma accounts (one per profile)
- handles timezone conversion automatically

### 1e. forum & community links (planned)
- monitor community forums (discord, discourse, etc.) for event links
- "join the call here: [link]" posts
- prixie watches threads the user is interested in

---

## phase 2: platform expansion

### recall.ai supported (ready to enable)
| platform | recall.ai support | chat | transcript | breakout rooms |
| --- | --- | --- | --- | --- |
| zoom | ✅ full | ✅ send + receive | ✅ | ✅ |
| google meet | ✅ full | ✅ send + receive | ✅ | n/a |
| microsoft teams | ✅ full | ✅ send + receive | ✅ | n/a |
| slack huddles | ✅ limited | ✅ send (no receive) | ✅ | n/a |
| cisco webex | ✅ partial | ❌ no chat | ✅ | n/a |
| goto meeting | ❌ | ❌ | ❌ | n/a |

### browserbase fallback (for unsupported platforms)
| platform | recall.ai | browserbase approach |
| --- | --- | --- |
| discord | ❌ | open discord in browser, join voice channel, capture audio |
| bluejeans | ❌ | open bluejeans link in browser, join meeting, capture audio |
| ringcentral | ❌ | open ringcentral link in browser, join meeting, capture audio |
| any url | ❌ | generic: open URL, find join button, enter name, capture audio |

browserbase approach:
1. prixie opens the meeting URL in a browserbase session
2. browser automation clicks "join" / enters name / handles auth
3. audio captured from the browser tab (via media capture api or system audio)
4. audio streamed to assembly.ai / speechmatics for transcription
5. transcript searched for keywords in real-time
6. screenshots captured on keyword detection
7. when meeting ends, full transcript + captured items returned

this is heavier and less reliable than recall.ai, but handles any platform with a browser-based join flow.

---

## phase 3: voice interaction

prixie speaks. prixie listens. prixie asks your questions out loud.

### architecture
1. real-time transcript handler detects organizer saying "any questions?" or opening q&a
2. prixie checks: any pre-specified questions (capture request type "ask") not yet answered?
3. if yes → turn on mic (mic_off = false)
4. prixie uses TTS (speechify or vapi) to speak the question
5. recall.ai "output speech/audio from bot" or browserbase audio injection
6. listens to the answer (real-time transcript continues)
7. if answer is unclear → follow up with a clarifying question
8. captures the full q&a exchange
9. turns mic back off

### provider stack (user has credits for all)
- **speechmatics** — STT for non-english/hinglish
- **speechify** — TTS for natural-sounding voice output
- **assembly.ai** — primary transcription (already integrated)
- **vapi** — full conversational voice agent (could handle the entire turn-taking loop)

### two approaches
A. **recall.ai + speechify**: use recall.ai's output audio feature to speak, assembly.ai for listening. more control, more pieces.
B. **vapi voice agent**: use vapi as the full voice interaction layer. simpler, but less control over the meeting bot.

---

## phase 4: transcript intelligence

### hinglish transliteration
- when speakers use hinglish (hindi + english mix), transcript should stay in latin script
- no devanagari — phonetically written in english letters
- italicized in the transcript view
- examples: "maine kha tha" not "मैने कहा था"
- approach:
  1. transcribe normally with assembly.ai
  2. post-process: detect any devanagari characters
  3. transliterate to latin using a transliteration library (e.g. sanscript, or an api)
  4. wrap hinglish portions in *italics*
  5. keep english portions as-is

### multi-speaker differentiation (done — hybrid diarization)
- separate audio streams per participant
- machine diarization for shared devices (conference rooms)
- speaker labels: participant name when available, generic label when not

---

## phase 5: autonomous operation

prixie operates without supervision. you trust prixie, prixie joins.

### principles
- prixie WILL join meetings at 3am if that's what you asked
- prixie asks what YOU want to know, not generic summaries
- no "here's a summary of the meeting" — instead "you asked about X, here's what they said"
- prixie handles failures gracefully: if bot can't join, it retries or notifies you
- prixie handles edge cases: waiting room, password, registration, breakout rooms

### account switching
- each profile has its own credentials (zoom login, google account, etc.)
- prixie uses the profile associated with the meeting
- hackathon profile → hackathon zoom account (not your legal name)
- professional profile → work account
- stored credentials are encrypted, never logged

### multiple inboxes
- each profile can have its own email inbox
- prixie monitors all inboxes for meeting links
- links are matched to the correct profile automatically

---

## phase 6: post-join interaction (future)

### in-meeting popup questions
- zoom post-join polls and mandatory questions
- requires custom zoom meeting sdk app (not recall.ai)
- would allow prixie to answer organizer questions automatically
- big build — separate project

### raise hand
- also requires custom zoom sdk
- not available via recall.ai

### zoom q&a tab
- not supported by recall.ai
- requires custom zoom sdk app

---

## platform priority

1. ✅ zoom (done — full recall.ai support)
2. ✅ google meet (done — full recall.ai support)
3. ✅ microsoft teams (done — full recall.ai support)
4. 🔧 slack huddles (recall.ai support — enable + test)
5. 🔧 cisco webex (recall.ai support — enable + test)
6. 🔧 discord (browserbase fallback needed)
7. 🔧 bluejeans (browserbase fallback needed)
8. 🔧 ringcentral (browserbase fallback needed)
9. 🔧 luma event registration (api integration needed)

---

## gui status

the frontend config dashboard is structurally functional with mock data:
- ✅ deploy form with all 6 config sections (meeting details, join behavior, attendance, capture requests, breakout rooms, instruction)
- ✅ dashboard with meeting cards, captured items, stats
- ✅ transcript viewer with speaker differentiation
- ✅ captured item cards with context
- ✅ status badges (scheduled, joining, in meeting, completed, failed)
- ✅ semantic css tokens matching the concept site aesthetic
- ❌ not wired to real backend api — uses localStorage with mock data
- ❌ missing routes: meetings list, meeting detail, captures list, about

to make it live:
1. replace mock data in `api.ts` with real fetch calls to the hono backend
2. run the backend with supabase
3. configure the vite proxy to point to the backend
