# behind the scenes

## how memorium indexes a memory

1. a fact arrives (from a transcript, user input, inference, or shared from another persona)
2. the fact is assigned to a perspective (which persona does this belong to?)
3. tags are extracted or assigned by the user (human tags, not auto-generated)
4. tags are wrangled: "coding" → canonical "programming" (alias match, confidence 0.95)
5. weight is assigned: how core is this to the persona's identity? (default 0.3, user-adjustable)
6. hierarchy is assigned: how much does this drive behavior? (default 0.2, user-adjustable)
7. confidence is set: how sure are we this is accurate? (default 0.5, adjusts with corroboration)
8. associations are auto-detected: does this relate to existing memories? (shared tags, shared category)
9. the memory is stored in the graph backend (falkordb) + metadata in the relational db (supabase)
10. the memory is embedded and stored in the vector store (mem0) for semantic search

## how memorium retrieves a memory

1. a query comes in with a persona context ("which perspective am i?")
2. the query is embedded for semantic search
3. semantic search runs against the vector store (mem0) — returns top-N candidates
4. tag matching: does the query match any canonical tags or aliases?
5. hierarchy boost: memories with high hierarchy get boosted (they drive behavior)
6. weight filter: for identity-sensitive queries, only high-weight memories are considered
7. persona relevance: how relevant is this tag to this specific persona?
8. source confidence: how confident are we in each candidate?
9. all six signals are combined with their weights:
   - semantic: 15%
   - tag match: 30%
   - hierarchy boost: 10%
   - identity weight: 10%
   - persona relevance: 20%
   - source confidence: 15%
10. the combined confidence score gates the output:
    - ≥ 0.75 → confident → return results
    - ≥ 0.45 → uncertain → return with a caveat
    - ≥ 0.25 → needs clarification → ask the user
    - < 0.25 → unavailable → "i don't have enough information"
11. every step is logged to the retrieval confidence table for inspection

## how memorium handles a POV switch

1. user selects a perspective (or the system infers it from context)
2. the current persona context is loaded: identity, permissions, config
3. all subsequent queries are scoped to this persona's sandbox
4. no cross-perspective data is accessible unless sharing rules are configured
5. new memories are indexed under this persona's identity
6. retrieval uses this persona's tag relevance weights
7. behavior (tone, initiative, question style) follows this persona's config
8. the switch is instant — no reload, no re-deploy, just a context shift

## how tag wrangling works in practice

1. user tags a memory with "coding"
2. the tag wrangler checks: is "coding" a canonical tag? → no
3. is "coding" an alias of a canonical tag? → yes → "programming"
4. the memory is tagged with canonical "programming" but original "coding" is preserved
5. confidence: 0.95 (alias match)
6. if no match: fuzzy matching against existing canonical tags
   - if fuzzy match is strong (≥ 0.85): suggest the canonical tag, ask to confirm
   - if fuzzy match is weak: create a new canonical tag (auto-wrangling)
7. if two canonical tags are found to mean the same thing: tag merge
   - all aliases, associations, and memory references move to the winner
   - the loser is deactivated (not deleted — preserves history)

## how sandbox enforcement works

1. a retrieval query comes in for persona A
2. the system checks: does persona A have access to this memory?
3. is this memory in persona A's own sandbox? → yes → allow
4. is this memory in persona B's sandbox? → check sharing rules
5. is there a sharing rule from B → A?
   - no → deny. log to sandbox_access_log with reason "no sharing rule"
   - yes → is the sharing condition met? (tags, category, min weight)
     - no → deny. log with reason "condition not met"
     - yes → allow. log with sharing_rule_id
6. every access attempt (allowed or denied) is logged to the audit trail
7. denied attempts include the reason for denial
