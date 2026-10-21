"""
Tests for memory normalizers.
"""

from retelldb.ingestion.normalizers.markdown import MarkdownNormalizer
from retelldb.ingestion.normalizers.openapi import OpenAPINormalizer
from retelldb.ingestion.normalizers.html import HTMLNormalizer
from retelldb.ingestion.normalizers.notion import NotionNormalizer
from retelldb.models.schema import NodeType, EdgeType


def test_markdown_normalizer():
    content = """---
title: hackathon memory
tags: [hackathon, pricing, security]
persona: hackathon
---

# hackathon memory

things the hackathon persona knows.

## pricing we agreed on

we landed on 30 a month for the team plan.

## who we met

professor chen, she runs the lab and owes us an access code.

## demo day logistics

demo day is the last friday, doors open at 8am.
"""
    normalizer = MarkdownNormalizer()
    doc = normalizer.normalize(content, namespace="shared")

    assert doc.document_title == "hackathon memory"
    assert "hackathon" in doc.global_tags
    assert len(doc.nodes) >= 4  # root + three sections

    # frontmatter persona wins over the caller's namespace
    assert all(n.namespace == "hackathon" for n in doc.nodes)

    types = {n.type for n in doc.nodes}
    assert NodeType.RELATIONSHIP in types          # "who we met"
    assert NodeType.FACT in types                  # pricing, logistics

    # hierarchy edges connect sections to their parent
    related_edges = [e for e in doc.edges if e.type == EdgeType.RELATED]
    assert len(related_edges) >= 2


def test_openapi_normalizer():
    """a spec a persona is expected to know: endpoints land as entity nodes."""
    spec = {
        "openapi": "3.0.0",
        "info": {"title": "Pet Store API", "version": "1.0.0"},
        "paths": {
            "/pets": {
                "get": {
                    "summary": "List all pets",
                    "tags": ["pets"],
                    "responses": {
                        "200": {"description": "List of pets"},
                        "500": {"description": "Server error"}
                    }
                }
            }
        },
        "components": {
            "schemas": {
                "Pet": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}, "name": {"type": "string"}}
                }
            }
        }
    }
    import json
    normalizer = OpenAPINormalizer()
    doc = normalizer.normalize(json.dumps(spec), namespace="shared")

    assert doc.document_title == "Pet Store API (v1.0.0)"
    node_types = {n.type for n in doc.nodes}
    assert NodeType.ENTITY in node_types     # endpoints and schemas are named things
    assert NodeType.FACT in node_types       # spec-level info


def test_html_normalizer():
    html_content = """
    <html>
        <head><title>hackathon rules page</title></head>
        <body>
            <nav><a href="/quickstart">quickstart</a></nav>
            <h2>submission rules</h2>
            <p>submissions close at 6pm, no exceptions.</p>
            <pre><code class="language-bash">git push origin main</code></pre>
        </body>
    </html>
    """
    normalizer = HTMLNormalizer()
    doc = normalizer.normalize(html_content, namespace="shared")

    assert doc.document_title == "hackathon rules page"
    # scraped pages become memory nodes, not doc-shaped type buckets
    assert any(n.type in (NodeType.FACT, NodeType.ENTITY) for n in doc.nodes)
    assert all(n.namespace == "shared" for n in doc.nodes)


def test_notion_normalizer():
    notion_json = {
        "results": [
            {
                "type": "heading_1",
                "heading_1": {"rich_text": [{"plain_text": "professor chen"}]}
            },
            {
                "type": "paragraph",
                "paragraph": {"rich_text": [{"plain_text": "runs the lab, owes us an access code"}]}
            }
        ]
    }
    import json
    normalizer = NotionNormalizer()
    doc = normalizer.normalize(json.dumps(notion_json), namespace="class")
    assert any("professor chen" in n.title.lower() for n in doc.nodes)
    assert all(n.namespace == "class" for n in doc.nodes)
