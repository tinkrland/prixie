# memorium

> memory becomes a weighted, hierarchical, associative structure that knows what information is important, what it relates to, who it belongs to, and when it should matter.

memorium is a standalone, portable persona-based memory system. it exists within prixie but is designed to work independently. it is not an LLM memory layer. it is a structured context engine.

---

## the problem

most memory persistence treats information too flatly. a chunk is relevant or it isn't. a fact is stored, embedded, retrieved by similarity. that doesn't capture how an agent would actually understand a person or a world.

some pieces of information are more important than others. some belong inside larger concepts. some are connected to dozens of other things. some only become relevant under very specific circumstances. memory needs to understand those relationships instead of treating every stored piece of information as roughly equivalent.

the core issue isn't that "LLM memory is bad." it's that most memory persistence lacks structure — weight, hierarchy, association, scope, ownership, and context.

---

## the reframe: POV switching

memorium is not "a persona joining a meeting." it is switching perspective.

think of it like a shared laptop. your coworker sits down, switches to their account, opens their instagram. the laptop is the same. the apps are the same. but what they see, what they can access, what matters to them — all different. they're a different perspective.

memorium does the same thing, but instead of different people, it's different perspectives of you:

- student you (classes, deadlines, notes, campus calendar)
- future founder you (startup ideas, investor meetings, pitch practice, networking)
- employee you (standups, work calendar, slack, professional tone)
- hobbyist you (side projects, discord communities, hackathons, casual tone)

the POV switch is rapid. one minute you're in a standup as employee you. the next you're joining a hackathon as hobbyist you. the system doesn't deploy "a new agent." it shifts perspective. same core identity, different contextual world model.

this POV switching is the goal. not multiple agents. one you, many perspectives, each with its own memory, permissions, relevance, and behavior.

---

## architecture: five layers

each perspective is made up of five interconnected layers. retrieval sits across all of them, producing context that is specific to the perspective rather than generic to the entire system.

### 1. identity + perspective

who this perspective IS and how they interpret the world.

```
identity:
  name: "karl"
  display_name: "karl"
  voice_id: "voice_001"
  background: "cs student, aspiring founder"
  worldview: "pragmatic, builder-first, values shipping over perfection"

perspective:
  this is how they interpret information.
  the same statement "we need to ship fast" means different things to
  student you (finish the assignment) vs founder you (launch the mvp).
  perspective shapes interpretation, not just knowledge.
```

identity is stable. perspective is the lens. both influence retrieval: a memory about "shipping fast" has different weight and different associations depending on which perspective is active.

### 2. memory

what this perspective knows. memory is not a bucket of chunks. it is a weighted, hierarchical, associative structure.

#### weight (identity core)

how central is this to who the perspective IS?

```
[0.95] "i am a developer"           — defining trait
[0.80] "i care about accessibility" — core value
[0.50] "i prefer dark mode"         — moderate preference
[0.20] "i like pizza"               — minor preference
[0.05] "it rained tuesday"          — transient fact
```

weight does NOT decay. you don't stop being a developer because you haven't mentioned it. weight is identity.

#### hierarchy (behavior drive)

how much does this DRIVE the perspective's behavior and discourse?

```
[0.90] "deadline is friday"          — urgent, drives everything right now
[0.85] "i am a developer"            — comes up constantly, influences questions
[0.70] "team is relying on me"       — active responsibility
[0.30] "i care about accessibility"  — core value but passive, rarely drives action
[0.10] "i like pizza"                — almost never relevant to behavior
[0.05] "it rained tuesday"           — irrelevant
```

hierarchy decays. "deadline is friday" stops driving behavior after friday. hierarchy is urgency and influence.

#### the two axes are orthogonal

```
                     HIERARCHY (behavior drive)
                low                    high
           ┌──────────────────┬──────────────────┐
    high   │  passive core    │  active identity  │
  WEIGHT   │  "i believe in   │  "i am a          │
  (identity│  open source"    │   developer"      │
     core) │  (who i am but   │  (who i am AND    │
           │   rarely drives  │   drives actions)  │
           │   behavior)      │                   │
           ├──────────────────┼──────────────────┤
    low    │  noise           │  urgent transient │
           │  "i like pizza"   │  "deadline fri"   │
           │  (not me, not    │  (not me, but     │
           │   driving)       │   drives everything│
           │                  │   right now)       │
           └──────────────────┴──────────────────┘
```

- high weight + high hierarchy: "i am a student" (defines me, drives my actions constantly)
- high weight + low hierarchy: "i believe in open source" (core to who i am, but i don't bring it up unless relevant)
- low weight + high hierarchy: "the exam is tomorrow" (not part of my identity, but it's all i'm thinking about)
- low weight + low hierarchy: "it rained last tuesday" (not core, not driving)

#### nesting (hierarchical structure)

memories exist inside larger concepts. they're not independent chunks — they're nodes in a tree.

```
person: karl
├── preferences
│   ├── food
│   │   ├── "likes coffee"          [weight: 0.3, hierarchy: 0.1]
│   │   └── "allergic to shellfish" [weight: 0.9, hierarchy: 0.7]  ← critical
│   ├── work
│   │   ├── "prefers async over sync" [weight: 0.5, hierarchy: 0.6]
│   │   └── "uses vim"               [weight: 0.4, hierarchy: 0.3]
│   └── style
│       └── "prefers concise answers"[weight: 0.6, hierarchy: 0.5]
├── identity
│   ├── "is a developer"             [weight: 0.95, hierarchy: 0.85]
│   ├── "is a student"               [weight: 0.85, hierarchy: 0.80]
│   └── "aspires to be a founder"    [weight: 0.75, hierarchy: 0.60]
├── schedule
│   ├── "standup at 9am mondays"     [weight: 0.2, hierarchy: 0.8]
│   └── "exam on friday"             [weight: 0.15, hierarchy: 0.95]
└── relationships
    ├── "close friend: sarah"        [weight: 0.7, hierarchy: 0.4]
    └── "mentor: prof. chen"         [weight: 0.65, hierarchy: 0.5]
```

note the difference between "likes coffee" (weight 0.3, low) and "allergic to shellfish" (weight 0.9, high). both are under food preferences. the nesting tells you they're related (both about food). the weight tells you one is critical and one is trivial.

#### associations (relational structure)

memories are connected to each other, not just nested. retrieval of one can pull in related memories based on association strength.

```
"i am a developer"
  ├──associates──> "uses vim"              (association: 0.8)
  ├──associates──> "prefers async"         (association: 0.6)
  ├──associates──> "aspires to be founder" (association: 0.7)
  └──associates──> "team is relying on me" (association: 0.5)

retrieving "i am a developer" might also surface:
  - "uses vim" (strong association, directly related)
  - "aspires to be founder" (moderate association, identity-adjacent)
  - "prefers async" (moderate association, work-style related)
  but NOT:
  - "it rained tuesday" (no association, irrelevant)
```

the system isn't just finding the closest vector. it's navigating a memory structure — following edges from retrieved nodes to related nodes, weighted by association strength, filtered by the active perspective's permissions and relevance.

### 3. contextual permissions

what this perspective can ACCESS.

```
perspective: student
├── calendar: campus calendar           [read]
├── calendar: personal calendar         [read]
├── inbox: personal gmail               [read]
├── discord: study server               [read, write]
├── slack: (none)                       [denied]
├── recall.ai: shared key               [use]
└── memory: (own only)                  [full]

perspective: employee
├── calendar: work calendar             [read]
├── inbox: work gmail                    [read]
├── slack: work workspace                [read, write]
├── discord: (none)                      [denied]
├── recall.ai: work key                  [use]
└── memory: own + shared from student   [partial]
```

permissions are per-source, per-perspective. a perspective can only see meetings, links, and memories from sources it has access to.

### 4. relevance

what this perspective CARES about. this shapes what gets noticed, what gets asked, what gets captured, what gets remembered.

```
perspective: hobbyist (hackathon)
├── watch for: hackathon rules, deadlines, access codes, API keys, prize info
├── ask about: judging criteria, tech stack requirements, team limits
├── capture: any links shared in chat, any QR codes on screen
├── remember: project ideas, team contacts, tech stack decisions
└── ignore: work schedule, class deadlines (unless shared)

perspective: employee
├── watch for: action items, meeting notes, decisions, blockers
├── ask about: (pre-specified questions from capture requests)
├── capture: key decisions, assigned tasks, timeline changes
├── remember: meeting outcomes, stakeholder positions, technical decisions
└── ignore: hackathon info, personal preferences (unless shared)
```

relevance is the filter between "what the perspective knows" and "what the perspective uses." a memory can exist in the structure but be irrelevant to the current perspective, so it doesn't surface during retrieval.

### 5. behavior

how this perspective ACTS on all of the above.

```
perspective: hobbyist
├── tone: casual, enthusiastic
├── initiative: proactive (asks questions without being prompted)
├── question_style: direct ("what's the tech stack?")
├── voice: energetic
└── decision_making: fast, bias toward action

perspective: employee
├── tone: professional, measured
├── initiative: passive (asks only pre-specified questions)
├── question_style: indirect ("could you elaborate on the timeline?")
├── voice: neutral
└── decision_making: careful, bias toward confirmation
```

behavior is how the perspective shows up in the world. it's the output layer — everything before it is internal context, behavior is the external manifestation.

---

## retrieval: how it works

retrieval is the core operation. it's not "find chunks similar to query." it's "who is asking, what do they know already, what are they allowed to see, what matters to them, and what related information should be brought into context?"

### the retrieval pipeline

```
INPUT: query + active perspective

1. perspective filter
   └─ load active perspective's identity, permissions, relevance, behavior
   └─ filter memory pool to only memories this perspective can access
   └─ filter by relevance (what does this perspective care about?)

2. semantic search (vector similarity)
   └─ find memories semantically similar to the query
   └─ uses mem0-style vector search as the base layer

3. hierarchy boost
   └─ boost high-hierarchy memories (currently driving behavior)
   └─ suppress low-hierarchy memories (not currently relevant)
   └─ this is NOT weight — weight is identity, hierarchy is urgency

4. weight threshold
   └─ for identity-sensitive queries, only use high-weight memories
   └─ for general queries, allow all weights
   └─ weight determines confidence in the memory being "core"

5. association traversal
   └─ from the semantically retrieved memories, follow association edges
   └─ pull in related memories based on association strength
   └─ each hop reduces the effective weight of the pulled memory
   └─ max 2-3 hops to prevent context explosion

6. nesting context
   └─ for each retrieved memory, include its parent node and siblings
   └─ this provides context for WHY the memory is relevant
   └─ e.g. retrieving "allergic to shellfish" also surfaces "food preferences"
   └─ the nesting gives the LLM context about the memory's place in the structure

7. confidence + decay
   └─ memories with low confidence are marked as uncertain
   └─ memories with high recall_count are reinforced
   └─ hierarchy decay applied (old urgent memories are less urgent now)
   └─ weight is NOT decayed (identity doesn't fade)

8. output: persona-specific context
   └─ ranked list of memories with weight, hierarchy, association, nesting context
   └─ formatted for the LLM context window
   └─ includes WHY each memory was retrieved (for transparency)
```

### example retrieval

```
QUERY: "should i take on this freelance project?"
ACTIVE PERSPECTIVE: student

1. perspective filter: student can access personal calendar, class schedule,
   personal memory. cannot access work memory (unless shared).

2. semantic search finds:
   - "has exams next week" [hierarchy: 0.9, weight: 0.3]
   - "needs money for laptop" [hierarchy: 0.6, weight: 0.5]
   - "aspires to be founder" [hierarchy: 0.6, weight: 0.75]
   - "prefers async work" [hierarchy: 0.6, weight: 0.5]

3. hierarchy boost: "has exams next week" gets boosted (high urgency)

4. weight threshold: "aspires to be founder" passes (high weight = core identity)

5. association traversal:
   - "aspires to be founder" → "needs money for laptop" (association: 0.7)
   - "aspires to be founder" → "prefers building over studying" (association: 0.6)

6. nesting context:
   - "has exams next week" → parent: schedule → context: academic calendar
   - "aspires to be founder" → parent: identity → context: long-term goals

7. output (ranked):
   1. "has exams next week" [urgent, schedule context]
   2. "aspires to be founder" [core identity, relevant to career choices]
   3. "needs money for laptop" [moderate urgency, related to founder goal]
   4. "prefers async work" [moderate, work style]
```

the same query under the "employee" perspective would retrieve different memories, with different weights, because the employee perspective has different permissions, different relevance, and a different identity lens.

---

## sharing between perspectives

sandboxed by default. sharing is opt-in and configurable.

### sharing types

**one-way flow**: perspective A can read perspective B's memory, but B can't read A's
```
student -> founder: share "building prixie" and tech skills
  (founder perspective knows what you're building as a student,
   but student perspective doesn't see your startup strategy)
```

**bidirectional flow**: both perspectives can read each other
```
student <-> employee: share schedule info
  (both know your class and work schedule so neither double-books)
```

**conditional sharing**: share only memories matching certain tags or categories
```
hackathon -> employee: share only memories tagged ["portfolio", "achievement"]
  (employee perspective knows about hackathon wins for resume,
   but not your 3am debugging rants)
```

**global traits**: shared across ALL perspectives (the base self)
```
global: "name is karl", "timezone is EST", "prefers concise answers"
  (every perspective inherits these)
```

### sharing is per-memory, not all-or-nothing

you can share "i won best hack" from hackathon -> employee without sharing "i forgot to eat for 18 hours." the weight, hierarchy, tags, and category of each memory determine what gets shared under which sharing rule.

---

## visual system

memory should not be an invisible database behind an agent. memorium represents it as a living, nested, weighted knowledge structure.

you should be able to:
- see what a perspective knows
- see what they consider important (weight)
- see what drives their behavior (hierarchy)
- see how pieces of information connect (associations)
- see where information came from (source tracking)
- see what they are allowed to access (permissions)
- see why a particular memory was retrieved (retrieval transparency)
- manually adjust weight, hierarchy, and associations (drag-and-drop, sliders)

### the GUI

```
+---------------------------------------------------------------------------+
|  MEMORIUM                                                    [POV: student] |
|                                                                            |
|  +---------+  +---------+  +----------+  +---------+                     |
|  | STUDENT  |  | EMPLOYEE|  | FOUNDER  |  | HOBBYIST|  ← switch POV       |
|  | (active) |  |         |  |          |  |         |                     |
|  +---------+  +---------+  +----------+  +---------+                     |
|                                                                            |
|  MEMORY STRUCTURE (student perspective)                                   |
|                                                                            |
|  person: karl                                                              |
|  ├── identity                                                               |
|  │   ├── "developer"         [w:0.95 h:0.85]  ████████ ████████            |
|  │   ├── "student"           [w:0.85 h:0.80]  ███████  ████████            |
|  │   └── "aspiring founder"  [w:0.75 h:0.60]  ██████   █████              |
|  ├── preferences                                                            |
|  │   ├── food                                                               |
|  │   │   ├── "likes coffee"           [w:0.3  h:0.1]  ██        █         |
|  │   │   └── "allergic to shellfish"  [w:0.9  h:0.7]  █████████ ██████    |
|  │   └── work                                                               |
|  │       └── "prefers async"        [w:0.5  h:0.6]  ████      █████       |
|  ├── schedule                                                               |
|  │   ├── "standup mondays"         [w:0.2  h:0.8]  █        ████████     |
|  │   └── "exam friday"             [w:0.15 h:0.95] █         ██████████  |
|  └── relationships                                                          |
|      ├── "friend: sarah"          [w:0.7  h:0.4]  ██████   ████           |
|      └── "mentor: prof chen"      [w:0.65 h:0.5]  █████    █████          |
|                                                                            |
|  ASSOCIATIONS (selected: "developer")                                      |
|  developer ──0.8──> uses vim                                               |
|  developer ──0.7──> aspiring founder                                       |
|  developer ──0.6──> prefers async                                          |
|  developer ──0.5──> team relying on me                                     |
|                                                                            |
|  PERMISSIONS                                                               |
|  [x] personal calendar   [x] personal gmail   [x] study discord            |
|  [ ] work calendar       [ ] work slack        [ ] work gmail             |
|                                                                            |
|  SHARING                                                                   |
|  student -> founder: one-way (tags: portfolio, achievement, tech)         |
|  student <-> employee: bidirectional (category: schedule)                 |
|  global traits: name, timezone, answer style preference                    |
|                                                                            |
|  [add memory]  [adjust weights]  [configure sharing]  [view retrieval]    |
+---------------------------------------------------------------------------+
```

---

## technical design

### data model

```sql
-- perspectives (identity + perspective)
perspectives {
  id, name, display_name, voice_id, background, worldview,
  tone, initiative_level, question_style, language_preference,
  is_active, is_default
}

-- memory nodes (weighted, hierarchical, associative)
memory_nodes {
  id,
  perspective_id,          -- who owns this memory
  parent_id,              -- nesting (null = root)
  key,                    -- human-readable label
  value,                  -- the actual memory content
  category,               -- grouping (preferences, identity, schedule, etc.)
  weight,                 -- 0-1, identity core (does NOT decay)
  hierarchy,              -- 0-1, behavior drive (decays over time)
  confidence,             -- 0-1, how sure we are this is accurate
  source,                 -- where it came from (transcript, user, inference, shared)
  source_meeting_id,      -- if from a meeting
  tags,                   -- text[] for conditional sharing
  recall_count,           -- how many times retrieved
  last_recalled,          -- when last retrieved
  created_at, updated_at
}

-- memory associations (relational edges between nodes)
memory_associations {
  id,
  source_node_id,
  target_node_id,
  strength,                -- 0-1, how strongly connected
  type,                    -- "related", "causes", "part_of", "contradicts"
  created_at
}

-- permissions (what each perspective can access)
persona_permissions {
  id,
  perspective_id,
  source_type,             -- calendar, inbox, discord, slack, luma, etc.
  source_id,               -- specific source identifier
  access_level             -- read, write, read_write, denied
}

-- sharing rules (how perspectives share memory)
persona_sharing {
  id,
  source_perspective_id,
  target_perspective_id,
  direction,              -- one_way, bidirectional
  condition_tags,          -- text[], share only memories with these tags
  condition_category,      -- text, share only memories in this category
  active                   -- boolean
}

-- global traits (shared across all perspectives)
global_memory {
  id, key, value, category, created_at, updated_at
}
```

### memory indexing

when new facts come in (from a transcript, user input, or inference):

1. **extract**: pull discrete facts from the source text
2. **classify**: assign category (identity, preferences, schedule, relationships, etc.)
3. **nest**: find parent node based on category and content
4. **weight**: initial weight based on:
   - how central it seems to the person's identity
   - how often it's mentioned
   - how strongly stated (explicit > inferred)
5. **hierarchy**: initial hierarchy based on:
   - urgency (deadlines, time-sensitive)
   - action-orientation (does this drive decisions?)
   - recency (fresh facts start higher)
6. **associate**: find related memories and create association edges
7. **tag**: assign tags for sharing rules
8. **store**: save as a memory_node with all metadata

### memory decay

```
weight (identity core):
  └─ does NOT decay
  └─ reinforced by recall (recall_count increases confidence)
  └─ can only be changed by explicit user action or strong evidence

hierarchy (behavior drive):
  └─ decays exponentially: h(t) = h0 * e^(-λ * t_since_last_recall)
  └─ λ = decay rate (tunable, default: 0.01 per day)
  └─ reinforced by recall (resets decay timer)
  └─ boosted by urgency signals (new deadline, new meeting)

confidence:
  └─ increases with corroboration (multiple sources confirm)
  └─ decreases with contradiction (new evidence contradicts)
  └─ explicit user statements start at 1.0
  └─ inferred facts start at 0.5

association strength:
  └─ reinforced when two memories are retrieved together frequently
  └─ decays if never co-retrieved
```

### integration with mem0

mem0 (github.com/mem0ai/mem0) provides the vector storage and semantic search layer. memorium wraps mem0 with:

1. **weighted retrieval**: mem0 finds similar chunks; memorium ranks them by weight + hierarchy
2. **nested retrieval**: mem0 returns flat chunks; memorium adds parent/sibling context
3. **associative retrieval**: mem0 does similarity; memorium traverses association edges
4. **persona filtering**: mem0 has user_id; memorium has perspective_id + permissions + sharing rules
5. **decay management**: mem0 stores memories; memorium manages their lifecycle

the base layer is mem0. the intelligence layer is memorium. memorium doesn't replace mem0 — it sits on top and adds structure, weight, hierarchy, association, and persona-based access control.

---

## within prixie

memorium is the context engine for prixie. when prixie joins a meeting:

1. **POV switch**: the active perspective is determined (student, employee, hobbyist, etc.)
2. **load context**: the perspective's memory, permissions, relevance, and behavior are loaded
3. **join meeting**: prixie joins AS this perspective, not as a generic agent
4. **real-time retrieval**: as the transcript flows, memories are retrieved based on what's being discussed
5. **indexing**: new facts from the transcript are indexed into this perspective's memory structure
6. **questions**: pre-specified questions are asked in the perspective's voice and style
7. **capture**: relevant items are captured and tagged with the perspective's context
8. **post-meeting**: transcript is processed, memories are updated, sharing rules determine what flows

the POV switch is instant. the same prixie instance can be student you at 9am, employee you at 10am, and hobbyist you at 7pm — each with completely different memory, permissions, and behavior.

---

## research question

the interesting research question: can associative + nested + weighted retrieval be efficient enough to actually improve training/inference behavior, while exposing it through a visual system where you can literally see and manipulate why something gets prioritized?

this is the core of memorium: instead of memory being a bucket of chunks, memory becomes a weighted, hierarchical, associative structure that knows what information is important, what it relates to, who it belongs to, and when it should matter.
