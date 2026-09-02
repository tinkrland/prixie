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

### in progress
- luma event registration (api integration, routes built)
- calendly sync (api integration, routes built)
- multi calendar sync (google, outlook, notion, apple)
- late join handling (waiting rooms, password prompts, "join anyway")
- timezone awareness (colloquial timezone parsing)

### not yet working
- frontend not wired to real backend api (uses mock data in localStorage)
- twitch stream joining (mlh hackathons)
- voice interaction (prixie speaking questions out loud)
- hinglish transliteration

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

### 1e. inbox monitoring (planned)
- monitor gmail for meeting links in emails
- parse email body for zoom/google meet/teams/join links
- match to calendar events or create standalone meeting records

### 1f. discord and slack live links (planned)
- monitor discord channels and slack channels for meeting links
- "call starting in #general: https://zoom.us/j/..." 
- links sent live during an event period (hackathon, webinar, etc.)

### 1g. forum and community links (planned)
- monitor community forums for event links
- "join the call here: [link]" posts

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

## phase 3: timezone awareness

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

### providers
- speechmatics: STT for non-english/hinglish
- speechify: TTS for natural voice output
- assembly.ai: primary transcription
- vapi: full conversational voice agent

---

## phase 6: transcript intelligence

### hinglish transliteration
- transcript keeps latin script for hinglish
- no devanagari, phonetically written, italicized
- approach: transcribe normally, detect devanagari, transliterate to latin, wrap in italics

### multi-speaker differentiation (working)
- separate audio streams per participant
- machine diarization for shared devices (conference rooms)
- speaker labels: participant name when available

---

## phase 7: autonomous operation

### principles
- prixie joins meetings at 3am if that's what you asked
- prixie asks what YOU want to know, not generic summaries
- no "here's a summary" - instead "you asked about X, here's what they said"
- handles failures gracefully: retries or notifies you
- handles edge cases: waiting room, password, registration, breakout rooms, late join

### account switching
- each profile has its own credentials
- hackathon profile -> hackathon zoom account
- professional profile -> work account
- stored credentials are encrypted

### multiple inboxes
- each profile can have its own email inbox
- prixie monitors all inboxes for meeting links

---

## gui status

frontend config dashboard wired to real backend api:
- all routes: dashboard, deploy form, meetings list, meeting detail, captures, about
- real fetch calls to backend (no more mock data)
- deploy form includes all platforms, auth modes, camera/mic toggles, profile selection
- backend routes: meetings, capture, transcripts, deploy, profiles, stats, browserbase, luma, calendly
- to run: npm install + npm run dev (frontend), deno task dev (backend)

---

## dependency and hosting

### what needs to be running
1. backend (hono server) - needs 24/7 hosting for autonomous operation
2. database (supabase) - cloud hosted, free tier works
3. recall.ai - cloud hosted by recall.ai
4. browserbase - cloud hosted for discord/bluejeans/ringcentral

### your device does not need to be on
if backend is in the cloud, prixie joins meetings whether your laptop is open or closed.

### hosting options
- deno deploy (free tier, easiest)
- aws (lambda + api gateway)
- xano (backend as a service)
- any vps ($5/mo)
- local machine (only works while on)
