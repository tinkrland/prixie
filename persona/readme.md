# persona

the context home. this folder plus `retelldb/` live on the context branch and are the
single source of prixie's persona context: what she knows, who she is
right now, and how she sounds.

or simply put: the surfaces (voice, video, socmed) are mouths; this is
the head.

## what lives here

- `voice_adapter.ts` — the bridge between the persona's fuzzy voice
  profile (tone scored 0..1, stored in retelldb) and the named delivery
  cues a tts takes. the only place the two vocabularies meet. masky's
  voiceStyle on video, tts cues on voice: same mapping, same file,
  synced from the context branch by `tools/sync-context.sh`.

## the rule

video and voice both own the same persona context and memories. the
voice is the same voice everywhere because there is exactly one
adapter, one retelldb, one persona graph. a surface branch never
edits `retelldb/` or `persona/` directly: change it on main, then run
`tools/sync-context.sh` on the surface branch.

## connections + platform scope (anne, oct 29 2026)

two new pieces answer "what carries over and what drops, per persona and
per platform", so a reconnect is a continuation and never a cold start:

- `retelldb/models/connections.py` — CONNECTIONS: the identity anchors.
  one person, the handles they hold per platform (discord username AND
  id, email, whatsapp number, telegram, slack, imessage, meeting
  emails), recorded once. the owner's own accounts are connections too
  (owner=True), so her own messages are never mistaken for a stranger's.
  handles normalize (emails/usernames lowercase, phones e164ish, ids
  verbatim); a handle matching two connections is AMBIGUOUS and
  resolves to none: guessing which of two people is in front of her is
  worse than not knowing. real handles live in env or the store, never
  in the repo.
- `retelldb/routing/scope.py` — the scope + carry/drop rules.
  `MemoryScope(persona_id, platform, connection_id)` says who is running,
  on what surface, in front of whom. platforms are classed private
  (dms, chat, email, phone), meeting (zoom/meet/teams), public_social
  (twitch/kick/youtube), website, and unknown. the rules, fail closed:
  unknown surface drops everything; another persona's memory drops
  (shared graph carries); an anchored person's context never surfaces
  in an unanchored session; one person's context never crosses into
  another person's session; meeting captures never surface on public
  social; sensitivity:private lives only on a private surface with its
  own person. everything else carries.

how a surface uses it: `QueryRequest(platform=..., connection_id=...)`
and the engine holds back what the rules forbid, reporting each drop in
`result.dropped` with the reason (a drop is a decision she can explain,
never a silent absence). no platform declared = the old behavior,
unchanged, so the migration is per surface, never a flag day. writes
stamp provenance (`platform:<p>`, `connection:<id>`) via
`ingest(scope=...)`, which is what makes the read rules enforceable
later.

the matrix is policy, not code: which personas exist, who the
connections are, and any per-pair overrides are configuration (env or
the context store); the rules above are the floor.

## the pieces

- `retelldb/` (next to this folder on the context branch) — the memory system itself: persona graphs, voice
  profiles, isolated memory per persona plus one shared global graph.
- `voice_adapter.ts` — profile -> delivery cues.
- `../memorium.md` (on the context branch root) — the concept: POV switching, not persona joining.
