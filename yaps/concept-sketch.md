# concept sketch

## the mental model

imagine your memory is not a filing cabinet (where everything is equally filed) but a living structure with:

- **roots** (identity — deep, stable, unchanging): "i am a developer." "my name is karl." these are the roots. pull one out and the tree changes.
- **branches** (behavior — what drives your actions right now): "the deadline is friday." "i'm presenting at the standup." these grow, wither, and fall off. they're not part of your identity, but they dominate your attention.
- **leaves** (transient facts — noise): "it rained last tuesday." "the meeting was at 3pm." these exist, they're technically memories, but they don't define you or drive you.

memorium models all three, on two axes:

```
         WEIGHT (identity core)
         high
          │
   "i am  │  "i believe in
   a dev" │   open source"
          │     (core to who i am,
          │      but i don't bring
          │      it up unless asked)
          │
          │         "it rained
          │          last tuesday"
          │           (noise)
          │
  ────────┼─────────────────── HIERARCHY (behavior drive)
          │
          │    "i am a student"
          │     (defines me AND
          │      drives everything)
          │
          │  "the exam is
          │   tomorrow"
          │    (not part of identity
          │     but ALL i think about)
          │
         low
```

## the perspectives model

```
          ONE YOU
        (global self)
            │
    ┌───────┼───────┐
    │       │       │
    ▼       ▼       ▼
 STUDENT  EMPLOYEE  HOBBYIST
    │       │       │
  memory  memory  memory
  perms   perms   perms
  tags    tags    tags
    │       │       │
    └───┬───┴───┬───┘
        │       │
     sharing  sharing
     (opt-in) (opt-in)
```

each perspective is a sandbox. it has its own memory, its own permissions, its own behavior. sharing between perspectives is explicit and conditional. by default: nothing crosses.

## the retrieval pipeline

traditional RAG:

```
documents → chunks → embeddings → similarity → context
                    (black box)
```

memorium:

```
knowledge
    ↓
human tags ("coding", "dev", "programming")
    ↓
tag wrangling (→ canonical: "programming")
    ↓
canonical concepts + hierarchy + associations
    ↓
weights + confidence scores
    ↓
persona sandbox (which perspective am i?)
    ↓
permissions + relevance (what can i see? what do i care about?)
    ↓
semantic retrieval (embeddings, demoted to 15%)
    ↓
confidence check (≥0.75? ≥0.45? ≥0.25?)
    ↓
context (with logged component scores)
```

every step is inspectable. every retrieval is debuggable. nothing is a black box.

## the GUI concept

```
┌──────────────────────────────────────────────────────────┐
│  MEMORIUM                                                  │
│                                                            │
│  [PERSONA CARDS]                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│  │ HACKATHON│  │  WORK   │  │  CLASS  │                    │
│  │ 12 mems  │  │ 47 mems │  │  8 mems │                    │
│  │ [graph]  │  │ [graph]  │  │ [graph] │                    │
│  └────┬────┘  └────┬────┘  └─────────┘                    │
│       └──→ one-way →┘                                      │
│           (project links)                                  │
│                                                            │
│  [KNOWLEDGE GRAPH]                                         │
│  D3 visualization of memory nodes + associations            │
│  nodes sized by weight, colored by hierarchy                │
│  edges show association strength                            │
│  click a node → see tags, source, confidence, last recall  │
│                                                            │
│  [TAG SIDEBAR]                                             │
│  AO3-style tag browser with hierarchy tree                  │
│  filter memories by canonical tag, alias, or category      │
│                                                            │
│  [PERMISSIONS MATRIX]                                      │
│  personas × sources grid with toggles                       │
│                                                            │
│  [RETRIEVAL LOG]                                           │
│  every query, every score, every decision                   │
│  "why was this retrieved?" → expand → see all 6 signals    │
└──────────────────────────────────────────────────────────┘
```

## what makes this different from mem0, zep, etc.

| feature | mem0 | zep | memorium |
| --- | --- | --- | --- |
| two-axis memory (weight + hierarchy) | no | no | yes |
| AO3-style tag wrangling | no | no | yes |
| persona/perspective sandbox | no | no | yes |
| human-legible retrieval (6 logged signals) | no | no | yes |
| underconfident thresholds | no | no | yes |
| GUI-first (not API-first) | no | no | yes |
| stack-agnostic | partially | no | yes |
| multimodal memory | partial | partial | yes |
| conditional per-memory sharing | no | no | yes |
| memory decay (hierarchy only, not identity) | no | no | yes |

memorium wraps mem0 for vector search. it doesn't replace it. it adds the structure that vector search alone can't provide.
