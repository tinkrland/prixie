"""
RetellDB Quickstart Example.
Ingest a persona's memory and query it back, plus a voice profile round trip.
"""

from retelldb import RetellDB
from retelldb.models.persona import PersonaProfile, LingvicaLayer, ToneDefaults


def main():
    print("=" * 60)
    print("RetellDB Quickstart Demo")
    print("=" * 60)

    # Initialize RetellDB in-memory client
    client = RetellDB(use_memory=True)

    # 1. A persona's memory file (frontmatter carries the owner)
    sample_memory = """---
title: hackathon prep notes
tags: [hackathon, pricing, demo]
persona: hackathon
---

# hackathon prep notes

everything the hackathon persona needs to remember.

## pricing we agreed on

we landed on 30 dollars a month for the team plan, and free for the first 100 users. do not say 25, that was the old number.

## who we met

professor chen runs the robotics lab. we met her on tuesday and she said she would send the access code by friday.

## demo flow preferences

the owner prefers running the demo live rather than slides. always ask for screen share first.
"""

    print("\n1. Ingesting memory into the hackathon persona graph...")
    ingest_resp = client.ingest(
        content=sample_memory,
        format="markdown",
        title="hackathon prep notes"
    )
    print(f"-> Ingestion completed in {ingest_resp.execution_time_ms}ms")
    print(f"   Graph:          {ingest_resp.graph}")
    print(f"   Nodes created:  {ingest_resp.nodes_created}")
    print(f"   Edges created:  {ingest_resp.edges_created}")
    print(f"   Tags created:   {ingest_resp.tags_created}")

    # Check status
    status = client.status(persona_id="hackathon")
    print("\nGraph Status:")
    print(f"   Hackathon Graph Nodes: {status.persona_graph['total_nodes']} (Tags: {status.persona_graph['total_tags']})")
    print(f"   Shared Graph Nodes:    {status.shared_graph['total_nodes']}")

    # 2. Save the persona's voice profile (how she talks, per medium)
    print("\n2. Saving the hackathon voice profile...")
    client.save_profile(PersonaProfile(
        persona_id="hackathon",
        display_name="hackathon the owner",
        lingvica=LingvicaLayer(
            register_by_medium={
                "voice": "fast, excited, pitchy",
                "chat": "lowercase, minimal punctuation",
            },
            tone_defaults=ToneDefaults(warmth=0.9, playfulness=0.7, confidence=0.8),
        ),
    ))
    profile = client.load_profile("hackathon")
    print(f"-> {profile.display_name}: voice register = {profile.register_for('voice')}")

    # 3. Precise / Tagged Query (triggers Semantic Tag Traversal)
    print("\n" + "-" * 60)
    print("3. Query 1 (Precise): 'what pricing did we agree on?'")
    result1 = client.query(
        query="what pricing did we agree on",
        persona_id="hackathon",
        max_hops=3,
        top_k=4,
        include_edges=True
    )
    print(f"-> Target Graph:   {result1.target_graph}")
    print(f"-> Retrieval Path: {result1.retrieval_path.value}")
    print(f"-> Latency:        {result1.execution_time_ms}ms")
    print("-> Retrieved Nodes:")
    for idx, sn in enumerate(result1.nodes, 1):
        print(f"   [{idx}] ({sn.node.type.value}) {sn.node.title} - Score: {sn.score} (via {sn.retrieval_source})")

    if result1.edges:
        print("-> Connecting Edges:")
        for e in result1.edges[:5]:
            print(f"   {e.source_id[:12]}.. --[{e.type.value}]--> {e.target_id[:12]}..")

    # 4. Vague / Latent Query (triggers Associative Vector Fallback)
    print("\n" + "-" * 60)
    print("4. Query 2 (Vague/Latent): 'the number that used to be right but now is wrong'")
    result2 = client.query(
        query="the number that used to be right but now is wrong",
        persona_id="hackathon",
        top_k=3
    )
    print(f"-> Target Graph:   {result2.target_graph}")
    print(f"-> Retrieval Path: {result2.retrieval_path.value}")
    print("-> Retrieved Nodes:")
    for idx, sn in enumerate(result2.nodes, 1):
        print(f"   [{idx}] ({sn.node.type.value}) {sn.node.title} - Score: {sn.score}")

    # 5. Persona isolation: another persona's graph stays empty
    print("\n" + "-" * 60)
    print("5. Same query against the 'class' persona graph...")
    result3 = client.query(
        query="what pricing did we agree on",
        persona_id="class"
    )
    print(f"-> Target Graph: {result3.target_graph}, Nodes: {len(result3.nodes)}")
    print("   (empty: hackathon facts never leak into another persona's head)")

    print("\n" + "=" * 60)
    print("Demo complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
