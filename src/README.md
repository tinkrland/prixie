# memorium (src)

this is where standalone memorium lives.

memorium is a standalone, portable, persona-based memory system. it is not coupled to prixie. it is not coupled to any specific stack. it is a structured context engine that any agent, app, or system can plug into.

## design principles

1. **stack-agnostic.** memorium does not assume your database, your backend, your frontend, or your language. it defines a data model and a retrieval pipeline. you implement it in whatever stack you already use. postgres, sqlite, redis, falkordb, mongodb, supabase, planetscale — doesn't matter. hono, fastapi, express, deno, bun, rails — doesn't matter. react, vue, svelte, solid, vanilla — doesn't matter. the concepts are portable.

2. **GUI first.** memorium is designed around visual interaction, not CLI or API-only flows. the GUI is not a wrapper around an API — it is the primary interface. personas are visual entities. memory is visualized as weighted, hierarchical, associative structures. permissions are a matrix. sharing is a flow diagram. retrieval is logged with transparency. the GUI exists to make memory legible and manipulable, not just queryable.

3. **human-legible retrieval.** when memorium retrieves something wrong, a human can inspect why. every retrieval is logged with its component scores: semantic similarity, tag match, hierarchy boost, identity weight, persona relevance, source confidence. no black boxes.

4. **sandboxed by default.** personas are isolated. no cross-perspective access unless explicitly configured. sharing is opt-in, per-memory, conditional.

5. **underconfident.** the system defaults to uncertainty. it asks to repeat, says it's unsure, rather than overconfidently replying. confidence thresholds gate whether results are returned, flagged, or withheld.

## what lives here

this `src/` folder is the reference implementation home for standalone memorium. because memorium is stack-agnostic, the actual implementation can take many forms. the structure below is the canonical layout — adapt it to your stack.

```
src/
├── README.md          ← you are here
├── core/              ← the memory engine (indexing, retrieval, decay)
├── tags/              ← AO3-style tag wrangling
├── personas/          ← persona/perspective management
├── permissions/       ← contextual permissions + sharing rules
├── gui/               ← the visual interface (GUI first, not API first)
├── storage/           ← storage adapters (postgres, sqlite, redis, etc.)
├── retrieval/         ← the underconfident retrieval pipeline
└── types/              ← shared types / schemas (stack-agnostic data model)
```

## how to use this

1. read `../yaps/readme.md` for the concept overview
2. read `../yaps/about.md` for what memorium is
3. read `../yaps/problem.md` for why it exists
4. read `../yaps/technobabble/archtecture.md` for the architecture
5. pick your stack, implement the data model, wire the retrieval pipeline, build the GUI

memorium is not a library you install. it is a system you build from a spec. the spec lives in `yaps/`.
