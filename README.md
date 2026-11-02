# context

the context branch: what prixie knows and how she sounds. nothing else
lives here. it exists so the surfaces (main, voice, video, socmed, recap)
never have to guess where the person ends and the mouth begins: the
person is here.

- `requirements.txt` — the memory system as a pinned dependency
  (`retelldb @ v0.2.8`), not a copy: persona graphs (what she knows,
  isolated per persona plus one shared global graph), voice profiles
  (how she says it), ingestion, routing, query, wrangling. the package
  lives at github.com/arsoninstigator/retelldb; this branch pins the
  released tag so a surface cannot drift ahead or behind unnoticed.
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
  byte-identical `persona/` + `requirements.txt` from here and install
  the pin. surfaces never edit the context: change it here, sync it
  down, commit the sync.

the surfaces are mouths. this is the head.
