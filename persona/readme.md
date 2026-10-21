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

## the pieces

- `retelldb/` (next to this folder on the context branch) — the memory system itself: persona graphs, voice
  profiles, isolated memory per persona plus one shared global graph.
- `voice_adapter.ts` — profile -> delivery cues.
- `../memorium.md` (on the context branch root) — the concept: POV switching, not persona joining.
