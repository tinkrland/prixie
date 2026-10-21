# prixie

prixie is a personal meeting proxy agent. she joins meetings on your behalf when you cant or dont want to be there, listens for the specific things you asked her to find, asks your pre approved questions if the floor opens, and comes back with exactly what you needed. not a summary. the actual answers, codes, links, and decisions you sent her for.

## why this is different

most meeting tools (granola, otter, fireflies, tl;dv, fathom) sit next to you and take notes while you talk. they assume you are in the meeting. they transcribe what you already heard. they are companions.

prixie is a proxy. she goes instead of you.

a note taker helps you remember what happened in a meeting you attended. prixie attends a meeting you did not go to and brings back the specific thing you needed from it. no generic summaries. no "here is what was discussed." just: you asked about the API timeline, they said q1. you asked for the access code, it is PRIXIE BUILD 2026 X9. done.

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
| `roadmap.md` | full roadmap with phases and priorities |

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
- she does not record video
- she does not raise her hand (no browser automation for it yet)
- she does not use the zoom q&a tab (requires custom zoom sdk app)
- she does not answer mandatory post join popup questions (requires zoom sdk)
- she does not replace you in meetings where your presence matters (she is a proxy, not a clone)

## license

personal project. do what you want with it.
