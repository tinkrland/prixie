# memorium roadmap

## current state (sept 2026)

### built (within prixie)
- memory schema v2 (8 tables + 3 views in supabase)
- memory engine v1 (indexing with auto-association, 7-step retrieval pipeline)
- retrieval pipeline v2 (underconfident, 6 weighted signals, logged scores)
- tag wrangler (AO3-style: canonical tags, aliases, synonyms, fuzzy matching, exclusions, associations, persona relevance, tag merge)
- multimodal memory (images, PDFs, docs, code)
- 20+ API endpoints at /api/memorium
- strict sandbox enforcement with audit log
- persona permissions + sharing rules (one-way, bidirectional, conditional)

### not yet working
- standalone extraction from prixie (memorium still coupled to prixie's backend)
- GUI (designed, not built — persona cards, knowledge graph, permissions matrix, retrieval log)
- memory decay service (designed, not built)
- storage adapters beyond supabase
- cross-system portability (memorium should work outside prixie)

---

## phase 0: standalone extraction

memorium exists within prixie but is designed to work independently. this phase is about making that real.

### 0a. decouple from prixie
- extract memorium into its own `src/` with no prixie dependencies
- define stack-agnostic interfaces for storage, retrieval, indexing
- remove all imports from prixie's services (recall.ai, calendar, meetings, etc.)
- memorium should be installable and runnable without prixie

### 0b. storage adapters
- postgres adapter (default, maps to existing schema)
- sqlite adapter (for local/single-user use)
- falkordb adapter (graph backend for memory nodes + associations + tags)
- redis adapter (for caching + graph)
- supabase adapter (existing implementation, refactored as an adapter)
- storage adapter interface: any system implements the same CRUD + query contract

### 0c. vector store adapters
- mem0 adapter (current default)
- pgvector adapter (postgres-native, no external service)
- pinecone adapter
- weaviate adapter
- qdrant adapter
- chroma adapter
- vector store interface: any system implements embed + search

### 0d. reference implementation
- one complete, working, standalone memorium in a chosen stack
- documented setup guide (install, configure, run)
- example: plug memorium into a simple chatbot to show it works without prixie

---

## phase 1: GUI (the primary interface)

GUI first. the GUI is not a wrapper around an API. it is the primary way to interact with memorium.

### 1a. persona cards
- visual cards for each perspective (identity, memory count, weight/hierarchy bars)
- click a card → expand into persona detail view
- create/edit/delete personas
- visual identity (display name, avatar, tone description)

### 1b. knowledge graph
- D3 visualization of memory nodes + associations
- nodes sized by weight (identity core), colored by hierarchy (behavior drive)
- edges show association type and strength
- click a node → detail panel (tags, source, confidence, last recall, recall count)
- drag nodes to reposition, zoom/pan
- filter by tag, by weight range, by hierarchy range, by content type
- this is the centerpiece of the GUI

### 1c. tag browser
- AO3-style tag sidebar
- canonical tag tree (parent/child hierarchy)
- aliases shown under each canonical tag
- click a tag → filter the knowledge graph to memories with that tag
- tag management: create, merge, set parent, add alias, set exclusion, set association
- fuzzy search across tags and aliases

### 1d. memory explorer
- tree view of memories within a persona
- sort by weight, by hierarchy, by confidence, by recency
- weight/hierarchy visualization bars
- edit weight and hierarchy via sliders (manual adjustment)
- view source, tags, associations, content (including multimodal)
- add/edit/delete memories
- bulk tag operations

### 1e. permissions matrix
- grid of personas × sources with toggle controls
- grant/revoke access per persona per source
- visual indicators for access level (read, write, read-write)
- bulk permission operations

### 1f. sharing flow diagram
- visual arrows between persona cards showing sharing rules
- one-way arrows (→), bidirectional arrows (↔)
- conditional sharing shown with a filter icon on the arrow
- click an arrow → configure sharing rule (tags, category, min weight, direction)
- add/remove sharing rules visually
- this is the explicit interface for cross-perspective access

### 1g. retrieval log
- every retrieval query logged with:
  - the query text
  - the persona that queried
  - retrieved memories (count + list)
  - component scores (semantic, tag match, hierarchy, weight, persona relevance, source confidence)
  - overall confidence score
  - decision (confident / uncertain / needs clarification / unavailable)
- filter by persona, by confidence level, by date
- "why was this retrieved?" expand → show all 6 signals and their weights
- this is the transparency layer — no black boxes

### 1h. memory decay dashboard
- view hierarchy decay across all memories
- see which memories are about to decay below threshold
- manually reinforce a memory (reset decay timer, boost hierarchy)
- decay rate configuration per persona

---

## phase 2: retrieval improvements

### 2a. adaptive weights
- retrieval weights (semantic 15%, tag 30%, etc.) should be tunable per persona
- some personas may rely more on semantic similarity, others on tag matching
- GUI slider to adjust the weight distribution
- A/B testing: compare retrieval quality with different weight distributions

### 2b. temporal relevance
- "deadline friday" should have high hierarchy on wednesday but near-zero on saturday
- time-based hierarchy boosting: memories tagged with time-sensitive tags get boosted when relevant
- configurable temporal windows per tag

### 2c. association traversal depth
- currently retrieves direct associations only
- add configurable traversal depth (2-hop, 3-hop associations)
- with diminishing strength per hop
- prevent infinite loops with cycle detection

### 2d. retrieval caching
- cache frequent queries per persona
- invalidate cache on memory add/update/delete
- configurable cache TTL

---

## phase 3: multimodal expansion

### 3a. audio memory
- store audio clips as memories
- transcription stored alongside audio for searchable retrieval
- speaker diarization metadata

### 3b. video memory
- store video clips with timestamps
- key frame extraction for visual context
- transcript + visual description stored for retrieval

### 3c. code memory
- store code snippets with language, syntax tree metadata
- function/class signature extraction for semantic search
- dependency graph for code memories

### 3d. structured data
- store tabular data (CSV, JSON) as memories
- column-level metadata for structured retrieval
- schema-aware search

---

## phase 4: portability

### 4a. export/import
- export a persona's full memory (with weights, hierarchies, tags, associations) as a portable format (JSON)
- import a persona from a portable format
- share personas between systems
- this is the "portable" in "standalone, portable"

### 4b. federation
- multiple memorium instances can share personas (with explicit consent)
- cross-system memory queries (with permissions)
- this is the long-term vision: memorium as a standard for agent memory

### 4c. SDK
- typescript SDK (reference)
- python SDK
- rust SDK (maybe)
- simple API: `memorium.recall(persona, query)`, `memorium.index(persona, fact)`, etc.

---

## phase 5: integration

### 5a. prixie integration (existing)
- memorium is already used by prixie for meeting memory
- this is the reference integration

### 5b. generic agent integration
- plugin/adapter for any agent system
- memory indexing from agent conversations
- retrieval as a context provider
- example integrations: langchain, autogen, crewai, custom agents

### 5c. human-facing integration
- memorium as a personal knowledge base (not just for agents)
- browser extension: save a page as a memory (with tags, weight, hierarchy)
- mobile app: quick capture of facts as memories
- this is memorium as a tool for humans, not just for AI agents
