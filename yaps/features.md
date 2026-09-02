# features

## weighted, hierarchical, associative memory

every memory has two independent axes:

- **weight** (0-1): how core this is to the persona's identity. does not decay. "i am a developer" = 0.95.
- **hierarchy** (0-1): how much this drives the persona's behavior. decays exponentially. "deadline friday" = 0.9.

plus associations between memories (strength, type) and confidence (how sure the system is this is accurate).

## AO3-style tag wrangling

inspired by archive of our own. instead of rigid taxonomies or embeddings expertise:

- canonical tags with aliases (synonyms, misspellings, abbreviations, translations)
- parent/child hierarchy ("python" is child of "programming")
- exclusions (mutually exclusive tags)
- associations (related tags with strength)
- persona-specific relevance weights per tag
- tag merge (combine duplicate canonical tags)
- auto-wrangling for new tags with fuzzy matching
- original language always preserved alongside canonical

## persona POV system

one you, many perspectives. each perspective has:

1. identity (who this perspective IS)
2. memory (what this perspective knows — sandboxed)
3. contextual permissions (what this perspective can ACCESS)
4. relevance (what this perspective CARES about)
5. behavior (how this perspective ACTS)

rapid POV switching. same core identity, different contextual world model.

## multimodal memory

memory is not just text. it stores:

- text
- images
- PDFs
- documents
- code
- audio
- video

extracted text from files is stored for searchable retrieval. content metadata (page numbers, line ranges, language) is preserved.

## underconfident retrieval pipeline

```
knowledge → human tags → tag wrangling → canonical concepts
→ hierarchy + associations → weights + confidence
→ persona sandbox → permissions + relevance
→ semantic retrieval → context
```

confidence thresholds gate output:
- ≥ 0.75: confident — return without caveat
- ≥ 0.45: uncertain — return but flag uncertainty
- ≥ 0.25: needs clarification — ask the user
- < 0.25: unavailable — "i don't have enough information"

every retrieval is logged with component scores: semantic similarity (15%), tag match (30%), hierarchy boost (10%), identity weight (10%), persona relevance (20%), source confidence (15%).

## strict sandbox enforcement

- no access to other persona's data unless explicitly configured
- sharing rules: one-way, bidirectional, conditional
- per-memory sharing (not all-or-nothing)
- every access attempt logged to audit trail
- denied access attempts logged with reason

## GUI-first interaction

- persona cards with identity, memory stats, access, pending questions
- D3 knowledge graph (neo4j-esque visualization of memory nodes + associations)
- tag filter sidebar (AO3-style)
- memory tree with weight/hierarchy bars
- permissions matrix (personas × sources)
- sharing flow diagram (visual arrows between persona cards)
- retrieval log (transparency — see exactly what was retrieved and why)
- drag-and-drop meeting assignment to perspectives
- memory weight/hierarchy sliders for manual adjustment

## stack-agnostic

memorium defines a data model and a retrieval pipeline, not a specific implementation. use whatever you already have:

- database: postgres, sqlite, redis, falkordb, mongodb, supabase, planetscale
- backend: hono, fastapi, express, deno, bun, rails
- frontend: react, vue, svelte, solid, vanilla
- vector store: mem0, pinecone, weaviate, qdrant, pgvector, chroma

the concepts are portable. the spec is the spec. you implement it.

## memory decay

- weight (identity) does NOT decay — you don't stop being a developer because you haven't mentioned it
- hierarchy (behavior drive) decays exponentially — "deadline friday" stops driving behavior after friday
- recall_count reinforces both axes — frequently used memories strengthen
- confidence adjusts with corroboration — multiple sources confirming a fact raises confidence

## memory indexing

new facts from any source (transcripts, user input, inference, shared) are extracted and stored with:
- initial weight (based on how often it's mentioned / how central it seems)
- initial hierarchy (based on urgency and action-orientation)
- tags (for organization and sharing rules)
- source tracking (where this memory came from)
- confidence score

## memory sharing

- **one-way flow**: persona A can read persona B's memory, but B can't read A's
- **bidirectional flow**: both personas can read each other's memory
- **common traits**: shared identity facts across all personas (global self)
- **conditional sharing**: share only when certain tags or categories match
- per-memory granularity — share "i won best hack" without sharing "i forgot to eat for 18 hours"
