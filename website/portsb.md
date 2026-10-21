# backend migration guide

## current backend dependencies

the current site has no database, authentication, file storage, background functions, or external backend dependency. all published content is stored in route source files.

## service mapping

| product need | current implementation | supabase equivalent |
| --- | --- | --- |
| authentication | not implemented | supabase auth |
| session instructions | not implemented | postgres table with row level security |
| meeting results | not implemented | postgres table with row level security |
| transcripts | not implemented | private storage bucket plus metadata table |
| scheduled attendance | not implemented | scheduled edge function or external scheduler |
| meeting provider integration | not implemented | edge functions calling provider apis |

## proposed database schema

### profiles

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `timezone text not null default 'utc'`
- `created_at timestamptz not null default now()`

### proxy_sessions

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `title text not null`
- `provider text not null`
- `join_url_encrypted text not null`
- `starts_at timestamptz not null`
- `instruction text not null`
- `status text not null`
- `created_at timestamptz not null default now()`

### proxy_questions

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references proxy_sessions(id) on delete cascade`
- `question text not null`
- `sort_order integer not null default 0`
- `answer text`

### proxy_results

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null unique references proxy_sessions(id) on delete cascade`
- `requested_information text`
- `summary text`
- `completed_at timestamptz`

### transcript_files

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references proxy_sessions(id) on delete cascade`
- `storage_path text not null unique`
- `mime_type text not null`
- `created_at timestamptz not null default now()`

each user-owned table should enable row level security and restrict reads and writes to rows where `user_id = auth.uid()`. child tables should check ownership through their parent session. grant only the operations required by each policy and grant service access only to trusted server functions.

## authentication migration

1. enable email link or chosen social providers in supabase auth.
2. create a profile row after signup with a database trigger or authenticated server action.
3. move authenticated product routes beneath a protected tanstack route layout.
4. pass the user access token to server functions and validate it before every private operation.
5. never store roles on the profile row. use a separate role table and server-side role checks if administration is introduced.

## storage migration

1. create a private `transcripts` bucket.
2. store files beneath a user and session path such as `{user_id}/{session_id}/transcript.txt`.
3. add storage policies that compare the first path segment with the authenticated user id.
4. issue short-lived signed urls only when a user requests the underlying source.

## server logic migration

1. keep browser-facing orchestration in typed tanstack server functions.
2. move webhook receivers, scheduled attendance, and long-running provider callbacks to verified public endpoints or supabase edge functions.
3. verify webhook signatures before reading or writing session data.
4. keep provider credentials in server-side secrets.
5. make every callback idempotent by storing the provider event id.

## limitations and differences

supabase does not provide meeting attendance by itself. each meeting platform needs its own api access, permissions, consent model, and bot implementation. some providers prohibit automated attendance or recording. transcription may require a separate service. scheduled work and long sessions may exceed edge function execution limits, so durable external job infrastructure may still be required.