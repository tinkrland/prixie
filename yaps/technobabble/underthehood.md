# under the hood

## the retrieval pipeline in detail

memorium's retrieval is not a single similarity search. it is a 7-step pipeline where each step contributes a weighted signal to the final confidence score.

### step 1: semantic search (15% of final score)

the query is embedded and searched against the vector store (mem0 by default). this returns the top-N candidates by cosine similarity.

this is the only step that uses embeddings. in traditional RAG, this is 100% of the retrieval. in memorium, it is demoted to 15%. embeddings are good at "this text is similar to that text" but terrible at "this is who i am" or "this is what matters right now."

```
query embedding → vector store → top-N candidates
                                    ↓
                          semantic_score (0-1)
```

### step 2: tag match (30% of final score)

the query is checked against canonical tags and their aliases. if the query matches a tag that a memory has, that memory gets a tag match score.

this is the primary signal. tags are human-assigned and human-wrangled. they encode what the memory is actually about, not just what words it contains.

```
query → tag wrangler → canonical tags
                         ↓
              match against memory tags
                         ↓
                  tag_match_score (0-1)
```

multi-tag matches compound: a memory tagged with 3 matching tags scores higher than one with 1 matching tag.

### step 3: hierarchy boost (10% of final score)

memories with high hierarchy (behavior drive) get a boost. if the query is about something actionable, high-hierarchy memories should surface first.

```
memory.hierarchy → hierarchy_boost_score (0-1)
```

this is why "deadline friday" surfaces when you ask about deadlines even if the semantic similarity is low — the hierarchy is high, so it gets boosted.

### step 4: identity weight (10% of final score)

memories with high weight (identity core) get a boost for identity-related queries. "who am i?" type queries should return high-weight memories.

```
memory.weight → weight_score (0-1)
```

### step 5: persona relevance (20% of final score)

each tag has a per-persona relevance weight. "programming" might be highly relevant to the "developer" persona (0.9) but barely relevant to the "student" persona (0.2). this signal adjusts retrieval based on which perspective is querying.

```
tag × persona → persona_relevance_score (0-1)
```

### step 6: source confidence (15% of final score)

each memory has a confidence score based on where it came from and how many times it's been corroborated. a memory from a reliable source that's been confirmed by multiple other memories scores higher.

```
memory.confidence → source_confidence_score (0-1)
```

### step 7: combination + threshold gate

```
final_score = (semantic × 0.15)
            + (tag_match × 0.30)
            + (hierarchy × 0.10)
            + (weight × 0.10)
            + (persona_relevance × 0.20)
            + (source_confidence × 0.15)
```

the final score gates output:
- ≥ 0.75 → confident → return without caveat
- ≥ 0.45 → uncertain → return but flag: "i'm not fully sure about this"
- ≥ 0.25 → needs clarification → ask user to clarify
- < 0.25 → unavailable → "i don't have enough information"

every retrieval logs all 6 component scores + the final score + the decision to `memory_retrieval_confidence`.

---

## memory indexing in detail

when a fact enters memorium:

### extraction

facts are extracted from various sources:
- **transcripts**: prixie processes meeting transcripts and extracts factual statements
- **user input**: the user directly adds a memory via the GUI
- **inference**: the system infers a fact from existing memories (e.g., "if i am a developer and i prefer python, i probably know about pip")
- **shared**: a fact shared from another persona via sharing rules

### assignment

each fact is assigned to a perspective. this determines which sandbox it lives in.

### tagging

tags are assigned by the user or extracted from the content. tags are wrangled to canonical tags via the tag wrangler.

### weighting

| signal | initial weight | initial hierarchy |
| --- | --- | --- |
| mentioned multiple times in a transcript | 0.5-0.8 | — |
| mentioned once, seems central | 0.3-0.5 | — |
| mentioned once, seems peripheral | 0.1-0.3 | — |
| action-oriented ("deadline", "todo", "must") | — | 0.7-0.9 |
| time-sensitive ("tomorrow", "friday", "urgent") | — | 0.8-0.95 |
| passive ("i believe", "i prefer") | — | 0.1-0.3 |
| identity statement ("i am", "my name is") | 0.8-0.95 | — |

weights and hierarchies are user-adjustable via the GUI sliders.

### association

after indexing, the system checks for associations:
- does this memory share tags with existing memories? → tag-based association (strength = tag overlap)
- does this memory share a category? → category-based association (strength = 0.3 default)
- is this memory temporally close to another? → temporal association (strength = 1/days_apart)

associations are bidirectional. both memories get linked.

---

## memory decay in detail

### what decays

only hierarchy decays. weight (identity) does not. you don't stop being a developer because you haven't mentioned it in a while.

### decay formula

```
current_hierarchy = original_hierarchy × e^(-decay_rate × days_since_last_recall)
```

default decay rate: 0.1 per day (configurable per persona)

example:
- "deadline friday" indexed on monday with hierarchy 0.9
- on friday (4 days later, not recalled): 0.9 × e^(-0.1 × 4) = 0.9 × 0.67 = 0.60
- on saturday (5 days, recalled on friday): recall resets the clock, so on saturday: 0.9 × e^(-0.1 × 1) = 0.9 × 0.90 = 0.81
- if never recalled, after 30 days: 0.9 × e^(-0.1 × 30) = 0.9 × 0.05 = 0.045 (essentially gone from behavior)

### recall reinforcement

every time a memory is retrieved:
- recall_count += 1
- last_recalled = now
- hierarchy decay clock resets
- if recall_count > threshold: weight gets a small boost (frequently used = more core to identity)

### confidence adjustment

- if a new memory confirms an existing one: confidence += 0.05 (cap 0.95)
- if a new memory contradicts an existing one: confidence -= 0.1 (floor 0.1), flag for review
- if a memory has not been recalled in 90+ days and confidence < 0.3: suggest archival

---

## tag wrangling in detail

### the wrangling algorithm

```
input: user_tag
  ↓
1. is user_tag already canonical? → use it. confidence: 1.0
  ↓ no
2. is user_tag an alias of a canonical tag? → use canonical. confidence: 0.95
  ↓ no
3. fuzzy match against all canonical tags + aliases
   - if best match ≥ 0.85: suggest canonical, ask to confirm. confidence: 0.85
   - if best match ≥ 0.70: suggest top 3, let user pick. confidence: 0.70
   - if best match < 0.70: create new canonical tag. confidence: 0.50
  ↓
4. store with canonical tag, preserve original user_tag
```

### fuzzy matching

uses a combination of:
- levenshtein distance (edit distance)
- jaro-winkler similarity (good for short strings)
- phonetic matching (metaphone: "colour" and "color" sound the same)

the highest score across all three methods is used.

### tag merge

when two canonical tags are found to mean the same thing:
1. user selects a "winner" and a "loser"
2. all aliases from the loser are moved to the winner
3. all tag associations from the loser are moved to the winner
4. all memory references (the tag column in memory_nodes) are updated
5. the loser's canonical tag is deactivated (is_active = false)
6. the loser is not deleted — this preserves audit history
7. a merge log entry is created
