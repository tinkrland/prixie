# prixie

prixie is an ai internet personality. she has a voice, a face, a room, a memory, and a feed: she joins meetings on your behalf, speaks with her own voice, appears on camera in her own space, and posts. the proxy was the first surface. the person is the whole.

she is not a tool you open. she is someone who exists online, and you delegate to her the way you would to a person: "go to this for me", "say this", "be there when i cant".

## the surfaces, one per branch

| branch | surface | what |
| --- | --- | --- |
| `main` | the proxy | she joins meetings for you: hono + supabase backend, dashboard, browserbase join engine. the first link source is her own inbox: forward the invite to her agentmail address and she joins. then the calendars: google, microsoft calendar (graph), apple calendar (caldav), notion, cal.com (v2 bookings api), zcal (bookings arrive via the host calendar and confirmation mail; no public api to pull). this readme covers this branch |
| `context` | her head | the persona context, and nothing else: `retelldb/` (the memory graphs), `persona/` (the voice adapter bridge, the one profile -> delivery cues mapping), `memorium.md` (the design). surface branches pull byte-identical copies with `sh tools/sync-context.sh` |
| `voice` | her voice | livekit in the already joined call, no second participant: she speaks into the call she is already in. end-of-turn detection, interruption handling (assembly.ai), retelldb persona memory as the knowledge source, and the obs + twitch bridge (ours, not masky's) |
| `video` | her face and room | masky renders voice + lip-sync as one turn, proskena authors the set (the proskena-derived pieces live in `studioify/`), rembg + ffmpeg composite her over the plate, `integrations/` holds the stream targets (twitch, kick) on our obs-websocket bridge. camera angle and light adjust from the proskena level; a camera-off handoff never cuts a sentence |
| `socmed` | her feed | the same pipeline sized for instagram 4:5, reels and tiktok 9:16 with the 14 percent ui bands, pinterest 2:3, square 1:1. it renders, it does not publish |
| `recap` | the after | you missed the session; there is a recording (an unlisted youtube link, a private stream vod). she watches it, finds what you asked for, and brings it back: fetch, transcribe, ingest, answer |
| `website/` | her site | the prixy web app (on main) |

her memory is the same across every surface: retelldb personas (what she knows, how she says it) with memorium.md as the design for the weighted, hierarchical whole. the context branch owns the context and nothing else; the surface branches carry byte-identical synced copies (`sh tools/sync-context.sh` from the surface branch), so her voice and her memories can never drift between video and voice.

## why the proxy is different

most meeting tools (granola, otter, fireflies, tl;dv, fathom) sit next to you and take notes while you talk. they assume you are in the meeting. they are companions.

prixie is a proxy. she goes instead of you.

a note taker helps you remember what happened in a meeting you attended. prixie attends a meeting you did not go to and brings back the specific thing you needed from it. not a summary. the actual answers, codes, links, and decisions you sent her for: you asked about the API timeline, they said q1. you asked for the access code, it is PRIXIE BUILD 2026 X9. done.

you sleep. prixie attends. you wake up to answers, not recordings.

## platform support

prixie runs on one join engine: a headless browser (browserbase). no recall.ai, no per-platform bot apis.

| platform | transcript | chat send | chat receive | status |
| --- | --- | --- | --- | --- |
| zoom | yes | via browser | via browser | selectors built, needs live testing |
| google meet | yes | via browser | via browser | selectors built, needs live testing |
| microsoft teams | yes | via browser | via browser | selectors built, needs live testing |
| discord | yes | via browser | via browser | built, needs testing |
| bluejeans | yes | via browser | via browser | built, needs testing |
| ringcentral | yes | via browser | via browser | built, needs testing |
| slack huddles | via browser | via browser | via browser | planned |
| cisco webex | via browser | via browser | via browser | planned |

all platforms share the same flow: open the meeting url in the headless browser, automate the join (name entry, join button, audio dialogs), scan the chat dom every few seconds, capture the session recording, transcribe with assembly.ai with speaker labels.

## capabilities

| feature | status | notes |
| --- | --- | --- |
| autonomous meeting join | working | joins on schedule, no supervision needed |
| google calendar sync | working | automatic meeting discovery |
| microsoft calendar sync (graph) | working | same flow as google, pulled each cycle from env credentials |
| apple calendar sync (caldav) | working | icloud app-specific password, same flow as google |
| agentmail inbox | working | link sourcing's first citizen: forward the invite to her address, the webhook parses it and she joins |
| zoom web sdk join | working | participant path: chat, reactions, raise hand, post-join popups. signature via /api/zoom/signature, sdk creds in env |
| real time keyword detection | working | monitors live transcript for your keywords |
| real time chat monitoring | working | captures links, codes, form urls from chat |
| post meeting transcript + diarization | working | speaker labels, hybrid per participant + machine |
| delayed join | working | default 2 min after start, configurable |
| camera off / mic off | working | both off by default, silent presence |
| attendance marking | working | chat message, google form, or custom |
| breakout room support | planned | browser automation of the zoom room invite popup (recall.ai used to handle this) |
| capture requests | working | keywords, links, codes, questions, with context |
| owner notify | working | a capture matched mid-meeting pushes to the owner instantly (agentmail email), because a code whose redemption window is the meeting itself is useless in a post-meeting recap. more channels plug into the same notifyOwner call |
| scarcity + self-redeem | working | she hears "first come first serve" / "first 50 people" spoken in the call, and a redeem-enabled capture request (redeem: true) makes her open the dropped link in her own session and submit before the meeting ends. no real addresses are ever hardcoded: they live in env so the repo is not a spam magnet. no-cc only: payment/card fields are a hard stop probed before any identity field is filled (promo codes are applied first; see below). attendance_method "form" enters attendance forms the same way. migrations 20261021_capture_redeem.sql + 20261021b must be applied to supabase |
| form email strategy | working | the address that enters a form is chosen per capture request (form_email_mode): regular (PRIXIE_FORM_EMAIL) / plus (default: prixie+<service>@ same inbox, the tag says exactly who leaked if spam starts) / disposable (throwaway created on demand via a disposable mail api, for sketchy saas and newsletter-gated downloads, discretionary) / business (PRIXIE_BUSINESS_EMAIL, for signups that demand a business address). never the owner's email; the owner only ever receives receipts. services/form_email.ts |
| promo + redeem buttons | working | hosts drop codes in chat ("use HACK50") and the redeem button usually lives outside the entire checkout flow. services/promo.ts extracts the code from the chat line (case-gated: real codes are typed in caps, "code will be sent" is not one) and form entry looks for redeem / promo-code buttons BEFORE the email fill, opens the code field, applies the code. the receipt email reports applied / looked-but-could-not-enter honestly |
| q&a ask flow | working | the owner's flow, for the case where the meeting's q&a panel is not enabled: (1) when a question window opens ("any questions?") she does NOT jump in, raised hands go first; (2) when hands clear (second ask / last call / wrap-up, or the window passing) she asks IN THE CHAT whether she can drop her question there; (3) only if a human prompts her to speak up, in chat or out loud, does she unmute and ask out loud (browserbase page: prixieUnmute helper or the mic button, then speech synthesis; engines with no mic fall back to chat honestly); (4) silence for two minutes past her permission ask = she posts the question in chat, which is what she asked for. the CAMERA never comes on in this flow, no branch turns it on. mid-meeting barging / interruption is NOT this flow (assembly.ai owns that, later). services/qna_flow.ts, wired into realtime transcript + chat. attendance_messages gained trigger 'qna' |
| link safety gate | working | she never browses freestyle: the only urls she opens are meeting joins, the attendance form, capture-matched links, and whitelisted forwards. every one now passes services/link_safety.ts FIRST, failing closed: non-http(s) schemes, credential-in-url lures, raw-ip/local hosts, punycode homoglyphs, exotic ports are blocked locally with no network; GOOGLE_SAFE_BROWSING_API_KEY (optional, env) adds google's threat-match lookup, no key = that layer is honestly off, never faked. blocked redeem links are not visited and the receipt email says so, blocked join links are refused, blocked attendance urls are skipped |
| forward whitelist | working | the agentmail front door only accepts meeting-joining forwards from whitelisted senders: PRIXIE_FORWARD_WHITELIST (comma separated, env only, same closed-by-default rule as the webhook secret). a stranger's forwarded invite is not a meeting she joins |
| term detector | working | a keyword-less capture request fires when an utterance carries code shape or a figure (tech words, proper nouns, math, codes). shape, not meaning, ranked candidates, never conclusions |
| prepared questions | planned | ask your questions out loud during q&a (needs voice feature) |
| profile / persona system | designed | sandboxed identities, per profile memory, shared global memory |
| link sourcing (discord, slack, luma) | partial | agentmail shipped, luma register-then-source shipped (signup-gated events wait on the confirmation path, needs_link says so); discord calls, slack huddles, forums are next. the honest map is docs/features/link-sourcing.md |
| join triggers | working | delay (default, n minutes after start) or participants: she holds until n humans are already inside, read from the pre-join page. a page that will not say is a hold, never a guess |
| hinglish transliteration | planned | latin script, italicized, phonetically written |
| voice interaction | planned | TTS to speak questions, STT to hear answers |
| browserbase fallback | planned | headless browser for unsupported platforms |

## what is in this repo

| path | what |
| --- | --- |
| `backend/` | hono server (deno). api routes, browserbase join engine, webhooks, scheduler, supabase client |
| `backend/src/routes/` | meetings, capture, transcripts, deploy, profiles, stats |
| `backend/src/routes/webhooks/` | realtime capture events, google calendar, agentmail inbound |
| `backend/src/scheduler/` | meeting manager cron (deploys bots, retrieves transcripts) |
| `backend/src/services/` | bot_provider.ts, browserbase_provider.ts, browserbase.ts, supabase.ts, calendar.ts, calendar_sync.ts (one adapter per source: google, microsoft/outlook, apple/caldav, notion, cal.com, zcal), agentmail.ts (her inbox: forwarded invite -> meeting), zoom_web_sdk.ts (the participant path for zoom) |
| `backend/supabase_schema.sql` | run this in supabase to create all tables |
| `frontend/` | react + tanstack router + tailwind v4 |
| `frontend/src/routes/` | dashboard, deploy form, meetings list, meeting detail, captures, about |
| `frontend/src/components/` | deploy form, meeting card, transcript view, captured item card, capture request form, status badge, site shell |
| `frontend/src/lib/` | api.ts (fetch calls to backend), types.ts |
| `yap/` | docs site content: about, features, behind the scenes, technobabble, problem (the folder name predates the voice branch rename) |
| `website/` | the prixy web app |
| the `context` branch | memorium.md (the memory design), retelldb/, persona/: the context lives on its own branch, not in this tree |
| `roadmap.md` | the current state of every branch + the proxy-era phase history |

## dependencies and hosting

### what needs to be running

prixie has three layers that each need a home:

1. **the backend** (hono server) - handles api calls, realtime webhooks, the scheduler that deploys bots and retrieves transcripts. this needs to be running 24/7 for prixie to operate autonomously.
2. **the database** (supabase / postgres) - stores meetings, capture requests, transcripts, profiles, memory. hosted on supabase cloud (free tier works).
3. **browserbase** - the meeting join engine. cloud hosted headless browsers. prixie automates the join like a human clicking through the web client.

### your device does not need to be on

this is the whole point. if the backend is hosted in the cloud, prixie joins meetings whether your laptop is open or closed. you set it up, prixie runs.

if the backend is running on your local machine and your device is off, prixie will not join. the scheduler will not run, the webhooks will not be received, and the bot will not be deployed.

### where to host the backend

| option | cost | notes |
| --- | --- | --- |
| deno deploy | free tier | easiest, runs hono natively, serverless |
| aws (lambda + api gateway) | pay per use | more setup, scales automatically |
| xano | paid | backend as a service, could replace supabase + hono |
| any vps (digitalocean, hetzner, fly.io) | $5/mo | run deno in a tmux/screen session |
| local machine | free | only works while your device is on |

### environment variables

copy `.env.example` to `.env` and fill in:

```
SUPABASE_URL=your supabase project url
SUPABASE_SERVICE_ROLE_KEY=your supabase service role key
BROWSERBASE_API_KEY=your browserbase key (the join engine for every platform)
ASSEMBLYAI_API_KEY=your assemblyai key
GOOGLE_CALENDAR_ID=your email
GOOGLE_CALENDAR_WEBHOOK_URL=your backend webhook url
PORT=3000
```

## quick start

```bash
# 1. set up the database
# create a supabase project, run backend/supabase_schema.sql in the sql editor

# 2. set up environment variables
cp .env.example .env
# fill in your keys

# 3. run the backend
cd backend
deno task dev    # runs on port 3000 (or set PORT)

# 4. run the frontend
cd frontend
npm install
npm run dev       # runs on port 3001, proxies /api to :3000

# 5. open the dashboard
# http://localhost:3001
```

## architecture

```
you -> dashboard (/deploy) -> create meeting + capture requests
                                    |
                              backend (hono)
                                    |
                         scheduler checks every 60s
                                    |
              meeting time arrives -> browserbase session joins via web client
                                    |
                         bot joins meeting (camera off, mic off)
                                    |
                    real time transcript + chat -> webhooks -> backend
                                    |
                         keyword match -> save captured item
                                    |
                         meeting ends -> session recording -> assembly.ai transcript
                                    |
                         deliver to you: what you asked for, with context
```

## what prixie does not do

- she does not take generic notes or summaries (you asked for specific things, she brings those)
- in meetings she attends as your proxy, her camera and mic are off by default (her face exists, on the video branch, where she is present as herself)
- zoom, the honest split: on the bot path (recall) she cannot raise her hand, touch the q&a tab, or answer mandatory post-join popup questions. on the zoom web sdk path she can: she joins as a participant through the same web client a browser joiner gets, so chat, reactions, raise hand, and the popup question are hers. recall's limits were recall's, not zoom's. the q&a panel is webinar-scoped: if the meeting has it, she tries, and that is the whole promise.
- she does not replace you in meetings where your presence matters (she is a proxy, not a clone)

## license

personal project. do what you want with it.
