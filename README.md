# prixie

prixie is an ai internet personality. she has a voice, a face, a room, a memory, and a feed: she joins meetings on your behalf, speaks with her own voice, appears on camera in her own space, and posts. the proxy was the first surface. the person is the whole.

she is not a tool you open. she is someone who exists online, and you delegate to her the way you would to a person: "go to this for me", "say this", "be there when i cant".

## the surfaces, one per branch

| branch | surface | what |
| --- | --- | --- |
| `main` | the proxy + the context | she joins meetings for you: hono + supabase backend, dashboard, browserbase join engine. this readme covers this branch. main also owns the persona context: `retelldb/` (the memory graphs) and `persona/` (the voice adapter bridge), synced into every surface branch by `tools/sync-context.sh` |
| `voice` | her voice (renamed from yap) | livekit in the already joined call, no second participant: she speaks into the call she is already in. end-of-turn detection, interruption handling (assembly.ai), retelldb persona memory as the knowledge source, and the obs + twitch bridge (ours, not masky's) |
| `video` | her face and room | masky renders voice + lip-sync as one turn, proskena authors the set (the proskena-derived pieces live in `studioify/`), rembg + ffmpeg composite her over the plate, camera angle and light adjust from the proskena level; a camera-off handoff never cuts a sentence |
| `video` | her face and room | masky renders voice + lip-sync as one turn, proskena authors the set, rembg + ffmpeg composite her over the plate, our own obs-websocket bridge runs obs and streams to twitch. camera angle and light adjust from the proskena level; a camera-off handoff never cuts a sentence |
| `socmed` | her feed | the same pipeline sized for instagram 4:5, reels and tiktok 9:16 with the 14 percent ui bands, pinterest 2:3, square 1:1. it renders, it does not publish |
| `website/` | her site | the prixy web app (on main) |

her memory is the same across every surface: retelldb personas (what she knows, how she says it) with memorium.md as the design for the weighted, hierarchical whole. main is the context branch: `retelldb/` and `persona/` live here and only here; the surface branches carry byte-identical synced copies (`sh tools/sync-context.sh` from the surface branch), so her voice and her memories can never drift between video and voice.

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
| real time keyword detection | working | monitors live transcript for your keywords |
| real time chat monitoring | working | captures links, codes, form urls from chat |
| post meeting transcript + diarization | working | speaker labels, hybrid per participant + machine |
| delayed join | working | default 2 min after start, configurable |
| camera off / mic off | working | both off by default, silent presence |
| attendance marking | working | chat message, google form, or custom |
| breakout room support | planned | browser automation of the zoom room invite popup (recall.ai used to handle this) |
| capture requests | working | keywords, links, codes, questions, with context |
| prepared questions | planned | ask your questions out loud during q&a (needs voice feature) |
| profile / persona system | designed | sandboxed identities, per profile memory, shared global memory |
| link sourcing (inbox, discord, slack, luma) | planned | multiple sources for finding meeting links |
| hinglish transliteration | planned | latin script, italicized, phonetically written |
| voice interaction | planned | TTS to speak questions, STT to hear answers |
| browserbase fallback | planned | headless browser for unsupported platforms |

## what is in this repo

| path | what |
| --- | --- |
| `backend/` | hono server (deno). api routes, browserbase join engine, webhooks, scheduler, supabase client |
| `backend/src/routes/` | meetings, capture, transcripts, deploy, profiles, stats |
| `backend/src/routes/webhooks/` | realtime capture events, google calendar |
| `backend/src/scheduler/` | meeting manager cron (deploys bots, retrieves transcripts) |
| `backend/src/services/` | bot_provider.ts, browserbase_provider.ts, browserbase.ts, supabase.ts, calendar.ts |
| `backend/supabase_schema.sql` | run this in supabase to create all tables |
| `frontend/` | react + tanstack router + tailwind v4 |
| `frontend/src/routes/` | dashboard, deploy form, meetings list, meeting detail, captures, about |
| `frontend/src/components/` | deploy form, meeting card, transcript view, captured item card, capture request form, status badge, site shell |
| `frontend/src/lib/` | api.ts (fetch calls to backend), types.ts |
| `yap/` | docs site content: about, features, behind the scenes, technobabble, problem |
| `website/` | the prixy web app |
| `memorium.md` | the memory design: weighted, hierarchical, per-persona |
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
- she does not raise her hand (no browser automation for it yet)
- she does not use the zoom q&a tab (requires custom zoom sdk app)
- she does not answer mandatory post join popup questions (requires zoom sdk)
- she does not replace you in meetings where your presence matters (she is a proxy, not a clone)

## license

personal project. do what you want with it.
