"""
Tests for persona routing and query tag signal detection.
"""

from retelldb.routing.persona import PersonaRouter
from retelldb.routing.classifier import QueryClassifier
from retelldb.models.schema import GraphNode, NodeType
from retelldb.config import default_config


def test_persona_router():
    router = PersonaRouter(default_config)

    # explicit persona routes to that persona's sandboxed memory
    ns, graph = router.resolve(persona_id="hackathon")
    assert ns == "hackathon"
    assert graph == "persona_hackathon"

    # no hint means shared memory
    ns, graph = router.resolve()
    assert ns == "shared"
    assert graph == "persona_shared"

    # raw namespace override wins
    ns, graph = router.resolve(persona_id="hackathon", namespace="class")
    assert ns == "class"
    assert graph == "persona_class"

    # persona ids are sanitized into safe graph tokens
    ns, graph = router.resolve(persona_id="My Startup Persona!!")
    assert ns == "my_startup_persona__"
    assert graph == f"persona_{ns}"


def test_query_tag_classifier():
    classifier = QueryClassifier()
    graph_tags = [
        GraphNode(title="auth", type=NodeType.TAG),
        GraphNode(title="tokens", type=NodeType.TAG),
        GraphNode(title="billing", type=NodeType.TAG),
    ]

    # Strong match
    has_signal, matched, conf = classifier.evaluate_tag_signal("how to handle auth tokens", graph_tags)
    assert has_signal is True
    assert "auth" in matched
    assert "tokens" in matched
    assert conf >= 0.8

    # Vague query without matching tags
    has_signal, matched, conf = classifier.evaluate_tag_signal("something broke completely yesterday", graph_tags)
    assert has_signal is False
    assert len(matched) == 0
