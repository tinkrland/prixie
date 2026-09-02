# prixie

a personal meeting proxy agent — joins meetings on your behalf, marks attendance, captures what you asked for, brings back the transcript.

## what prixie does

- joins zoom, google meet, and teams meetings as your proxy when you can't attend
- marks attendance in chat (e.g. "present!")
- monitors the live transcript and chat for keywords you specify (access codes, links, form URLs)
- captures screenshots when keywords are detected
- brings back the full transcript with speaker differentiation (hybrid diarization)
- supports zoom breakout rooms
- delays joining so it's never the first person in the room
- profile/persona system — different identities for different contexts (hackathon vs professional)

## architecture

```
prixie/
  backend/     — deno + hono + supabase (zero base44 deps, deployable anywhere)
  frontend/    — tanstack start + react + tailwind (config dashboard + transcript viewer)
```

### backend
- **hono** web framework on deno
- **supabase** for database (postgres + RLS)
- **recall.ai** for meeting bot deployment, transcription, real-time events
- **google calendar** sync via googleapis
- scheduled meeting manager (cron) — deploys bots, retrieves transcripts
- real-time webhook handler — keyword detection, chat monitoring

### frontend
- **tanstack start** (typescript + react)
- config dashboard for deploying prixie to meetings
- meeting detail view with speaker-differentiated transcripts
- captured items display (keyword matches, chat links, screenshots)
- profile management for different personas

## setup

### prerequisites
- deno 1.40+
- a supabase project (free tier works)
- a recall.ai account + api key
- (optional) google cloud project for calendar sync

### backend
```bash
cd backend
cp ../.env.example .env
# fill in your env vars
deno task dev
```

### frontend
```bash
cd frontend
npm install
npm run dev
```

### database
run `backend/supabase_schema.sql` in your supabase sql editor to create all tables.

## env vars

see `.env.example` for the full list. key ones:
- `RECALL_API_KEY` — recall.ai api key
- `SUPABASE_URL` — supabase project url
- `SUPABASE_SERVICE_ROLE_KEY` — supabase service role key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for calendar sync
- `WEBHOOK_URL` — public url of your backend (for recall.ai webhooks)

## what's not supported (yet)

- **raise hand** in zoom/meet — not in recall.ai's api
- **zoom q&a tab** — not supported by recall.ai
- **in-meeting popup questions** — bot can't interact with polls/q&a popups
- **voice interaction** (planned) — prixie speaking questions out loud at the end of meetings

## license

private project.
