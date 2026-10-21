# context

the context branch: what prixie knows and how she sounds. nothing else
lives here. it exists so the surfaces (main, voice, video, socmed, recap)
never have to guess where the person ends and the mouth begins: the
person is here.

- `retelldb/` — the memory system: persona graphs (what she knows,
  isolated per persona plus one shared global graph), voice profiles
  (how she says it), ingestion, routing, query.
- `persona/` — the other stuff, separately: `voice_adapter.ts` is the one
  bridge between the persona's fuzzy voice profile (tone scored 0..1 in
  retelldb) and the named delivery cues a tts takes. both the video
  branch (masky voiceStyle) and the voice branch (tts cues) import the
  same file, so the voice is the same voice everywhere by construction.
- `memorium.md` — the design: POV switching, not persona joining.
  memory as a weighted, hierarchical, associative structure that knows
  what is important, what it relates to, who it belongs to, and when it
  should matter.
- `tools/sync-context.sh` — run on a surface branch to pull
  byte-identical `retelldb/` + `persona/` from here. surfaces never edit
  the context: change it here, sync it down, commit the sync.

the surfaces are mouths. this is the head.
