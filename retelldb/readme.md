# retelldb

persona memory retrieval for agents that actually know things.

retelldb is the memory layer prixie's voice uses: what she knows before she opens her mouth. it ingests a persona's memory files into a per-persona property graph plus a vector index, then retrieves the relevant slice at question time.

or simply put: memories go in per person, and only that person's head gets searched.

## how it works

- **ingestion**: markdown (and html, notion json, openapi) memory files are normalized into typed memory nodes: `fact`, `preference`, `relationship`, `event`, `skill`, `entity`. deterministic ids mean re-ingesting the same file is idempotent, and edited sections upsert while removed sections get reconciled away.
- **graphs**: every persona gets its own isolated graph (`persona_hackathon`, `persona_class`, ...), plus one `persona_shared` graph for global facts. a memory file's frontmatter `persona:` field decides where it lands: the file wins over the caller. no persona's nodes ever leak into another's graph.
- **retrieval**: a routing layer reads the query. precise, tagged queries (a tag matches) traverse the tag taxonomy graph, expanding across `related`/`about` edges. vague queries fall back to associative vector similarity. the engine fuses the two when both fire.
- **voice profiles**: a persona's voice profile (language substrate, vocabulary, delivery: see `models/persona.py`) is stored as a node in their own graph, so how she talks travels with what she knows. register can differ per medium (voice vs chat vs email).

## quickstart

```python
from retelldb import RetellDB

client = RetellDB(use_memory=True)

# ingest a memory file (frontmatter carries the owner)
client.ingest(
    content="---\ntitle: demo preferences\ntags: [demo, preference]\npersona: hackathon\n---\n...",
    format="markdown",
    source_uri="memory/hackathon/demo.md",
)

# save the persona's voice profile
from retelldb.models.persona import PersonaProfile
client.save_profile(PersonaProfile(persona_id="hackathon", display_name="hackathon the owner"))

# ask. only the hackathon graph and the shared graph are searched.
result = client.query("how does the owner want the demo run?", persona_id="hackathon")
```

## run it

```bash
pip install -e ./retelldb        # or add retelldb/ to your path
retelldb serve                   # fastapi on :8000 (POST /v1/query, /v1/ingest, /v1/profile)
retelldb ingest memory.md -p hackathon
retelldb query "who owes us the lab code" -p hackathon
```

falkordb + pgvector backends for production: `docker compose up -d` (compose file at the repo root). the default is a hermetic in-memory backend, and the embedder degrades to deterministic token projection when no litellm key is set, so the whole thing runs with zero external services.

## evals

```bash
PYTHONPATH=. python3 evals/run_evals.py
```

persona memory corpus in `evals/corpus/`, golden queries in `evals/golden_queries.yaml` covering tag traversal, vector fallback, persona routing, and isolation (one persona's query must never surface another persona's facts). current run: hit 100%, path accuracy 100%, persona routing 100%.
