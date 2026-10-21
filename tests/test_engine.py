"""
End-to-end tests for IngestionPipeline, RetrievalEngine, and RetellDB client.
Persona memory flavored: ingest a persona's memory file, query it back.
"""

from retelldb.client import RetellDB
from retelldb.models.schema import NodeType
from retelldb.models.query import QueryStrategy


def test_end_to_end_retrieval():
    client = RetellDB(use_memory=True)

    # 1. Ingest a persona's memory file
    memory_doc = """---
title: hackathon prep notes
tags: [hackathon, pricing, demo]
persona: hackathon
---

# hackathon prep notes

everything the hackathon persona needs to remember for the demo.

## pricing numbers we agreed on

we landed on 30 dollars a month for the team plan, and free for the first 100 users. do not say 25, that was the old number.

## who we met

we met with the professor again on tuesday, professor chen, she said she would send the access code for the lab by friday.

## demo flow preference

the owner prefers running the demo live rather than slides. always ask for screen share first.
"""

    resp = client.ingest(
        content=memory_doc,
        format="markdown",
        persona_id="hackathon",
        title="hackathon prep notes",
        source_uri="memory/hackathon/prep.md"
    )

    assert resp.success is True
    assert resp.nodes_created >= 4
    assert resp.tags_created >= 3
    assert resp.graph == "persona_hackathon"

    # Check status
    status = client.status(persona_id="hackathon")
    assert status.persona_graph["total_nodes"] > 0
    assert status.shared_graph["total_nodes"] == 0
    assert status.embedding_subsystem is not None

    # 2. Test Tag Traversal (precise / tagged query)
    tag_result = client.query(
        query="what was the pricing we agreed on",
        persona_id="hackathon",
        max_hops=3,
        top_k=5,
        include_edges=True
    )

    assert tag_result.retrieval_path in (QueryStrategy.TAG_TRAVERSAL, QueryStrategy.HYBRID)
    assert len(tag_result.nodes) > 0
    node_contents = [sn.node.content for sn in tag_result.nodes]
    assert any("30" in c for c in node_contents)
    assert len(tag_result.edges) > 0

    # 3. Test Vector Fallback (vague / latent query without exact tag match)
    vague_result = client.query(
        query="the person who is going to let us into the building",
        persona_id="hackathon",
        top_k=3
    )

    assert len(vague_result.nodes) > 0

    # 4. Persona isolation test (another persona's memory should be empty)
    other_result = client.query(
        query="what was the pricing we agreed on",
        persona_id="class"
    )
    assert other_result.target_graph == "persona_class"
    assert len(other_result.nodes) == 0

    # and shared memory is a separate graph too
    shared_result = client.query(
        query="what was the pricing we agreed on"
    )
    assert shared_result.target_graph == "persona_shared"
    assert len(shared_result.nodes) == 0


def test_idempotent_reingestion_and_upsert():
    """Verify re-ingesting the same memory produces deterministic IDs without duplicate nodes."""
    client = RetellDB(use_memory=True)

    doc_v1 = """---
title: sprint facts
tags: [sprint, standup]
persona: hackathon
---
# sprint facts
## standard meeting time
standup is at 9:30 every morning.
## demo day
demo day is the last friday of the month.
"""

    # Ingest v1
    resp1 = client.ingest(
        content=doc_v1,
        format="markdown",
        persona_id="hackathon",
        source_uri="memory/hackathon/sprint.md"
    )
    stat1 = client.status(persona_id="hackathon")
    initial_nodes = stat1.persona_graph["total_nodes"]
    initial_edges = stat1.persona_graph["total_edges"]

    # Re-ingest the exact same doc (should be completely idempotent)
    resp2 = client.ingest(
        content=doc_v1,
        format="markdown",
        persona_id="hackathon",
        source_uri="memory/hackathon/sprint.md"
    )
    stat2 = client.status(persona_id="hackathon")
    assert stat2.persona_graph["total_nodes"] == initial_nodes
    assert stat2.persona_graph["total_edges"] == initial_edges

    # Ingest v2 where "demo day" section was removed (upsert reconciliation)
    doc_v2 = """---
title: sprint facts
tags: [sprint, standup]
persona: hackathon
---
# sprint facts
## standard meeting time
standup is at 9:30 every morning.
"""
    resp3 = client.ingest(
        content=doc_v2,
        format="markdown",
        persona_id="hackathon",
        source_uri="memory/hackathon/sprint.md"
    )
    stat3 = client.status(persona_id="hackathon")
    # The demo day node should be reconciled and removed
    assert stat3.persona_graph["total_nodes"] < initial_nodes


def test_persona_isolation_frontmatter_override():
    """Verify that frontmatter persona overrides route strictly to the persona's graph."""
    client = RetellDB(use_memory=True)

    class_doc = """---
title: class logistics
tags: [class, schedule]
persona: class
---
# class logistics
the midterm got moved to november 3rd.
"""

    # Ingest call mistakenly specifies another persona, but frontmatter declares persona: class
    resp = client.ingest(
        content=class_doc,
        format="markdown",
        persona_id="hackathon",  # caller argument
        source_uri="memory/class/logistics.md"
    )

    stat = client.status(persona_id="hackathon")
    # the hackathon persona's graph must be completely empty!
    assert stat.persona_graph["total_nodes"] == 0
    # the class persona's graph must contain the nodes!
    class_stat = client.status(persona_id="class")
    assert class_stat.persona_graph["total_nodes"] > 0


def test_hop_distance_decay_scoring():
    """Verify that graph traversal scores decay with hop distance from the matched tag."""
    client = RetellDB(use_memory=True)

    doc = """---
title: payment logistics
tags: [payments]
persona: hackathon
---
# payment logistics
how we handle paying for services.

## preferred vendor
we prefer paying through stripe, invoiced monthly.

## the receipt habit
the owner saves every receipt to the shared drive.
"""
    client.ingest(content=doc, format="markdown", persona_id="hackathon")

    result = client.query(
        query="payments",
        persona_id="hackathon",
        max_hops=3,
        top_k=5
    )

    assert result.retrieval_path in (QueryStrategy.TAG_TRAVERSAL, QueryStrategy.HYBRID)
    # Check that scores decrease or remain consistent with distance
    scores = [sn.score for sn in result.nodes]
    assert scores[0] >= scores[-1]
    assert all(s <= 1.0 for s in scores)


def test_persona_profile_roundtrip():
    """Verify a persona's voice profile saves into their graph and loads back."""
    from retelldb.models.persona import PersonaProfile, LingvicaLayer, ToneDefaults

    client = RetellDB(use_memory=True)

    profile = PersonaProfile(
        persona_id="hackathon",
        display_name="hackathon the owner",
        lingvica=LingvicaLayer(
            register_by_medium={"voice": "fast, excited, pitchy", "chat": "lowercase, minimal punctuation"},
            tone_defaults=ToneDefaults(warmth=0.9, playfulness=0.7, confidence=0.8),
        ),
    )
    resp = client.save_profile(profile)
    assert resp.success is True
    assert resp.graph == "persona_hackathon"

    loaded = client.load_profile("hackathon")
    assert loaded is not None
    assert loaded.persona_id == "hackathon"
    assert loaded.register_for("voice") == "fast, excited, pitchy"
    assert loaded.lingvica.tone_defaults.warmth == 0.9

    # a persona with no saved profile returns None
    assert client.load_profile("nobody") is None
