"""
Tests for FastAPI hosted API endpoints.
"""

from fastapi.testclient import TestClient
from retelldb.server.app import create_app
from retelldb.config import RetellDBConfig, StorageConfig


def test_api_endpoints():
    test_config = RetellDBConfig(
        storage=StorageConfig(backend="memory"),
        allowed_origins=["*"]
    )
    app = create_app(test_config)
    client = TestClient(app)

    # 1. Health check
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "embedding_mode" in resp.json()

    # 2. Ingest a persona's memory file
    ingest_payload = {
        "content": "# hackathon notes\n\n## pricing we agreed on\n\n30 a month for the team plan.\n",
        "format": "markdown",
        "persona_id": "hackathon",
        "title": "hackathon notes"
    }
    resp = client.post("/v1/ingest", json=ingest_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["nodes_created"] > 0

    # 3. Status check
    resp = client.get("/v1/status", params={"persona_id": "hackathon"})
    assert resp.status_code == 200
    stat = resp.json()
    assert stat["persona_graph"]["total_nodes"] > 0
    assert stat["shared_graph"]["total_nodes"] == 0
    assert "embedding_subsystem" in stat

    # 4. Query that persona's memory
    query_payload = {
        "query": "pricing we agreed on",
        "persona_id": "hackathon",
        "max_hops": 2,
        "top_k": 3,
        "include_edges": True
    }
    resp = client.post("/v1/query", json=query_payload)
    assert resp.status_code == 200
    q_data = resp.json()
    assert q_data["success"] is True
    assert len(q_data["result"]["nodes"]) > 0
    assert q_data["result"]["target_graph"] == "persona_hackathon"

    # 5. Persona profile round trip
    profile_payload = {
        "persona_id": "hackathon",
        "display_name": "hackathon the owner",
        "lingvica": {
            "register_by_medium": {"voice": "fast and excited"},
            "tone_defaults": {"warmth": 0.9, "playfulness": 0.7, "confidence": 0.8, "sarcasm_level": 0.1},
        },
    }
    resp = client.post("/v1/profile", json=profile_payload)
    assert resp.status_code == 200
    assert resp.json()["graph"] == "persona_hackathon"

    resp = client.get("/v1/profile/hackathon")
    assert resp.status_code == 200
    assert resp.json()["persona_id"] == "hackathon"
    assert resp.json()["lingvica"]["register_by_medium"]["voice"] == "fast and excited"

    resp = client.get("/v1/profile/nobody")
    assert resp.status_code == 404


def test_api_authentication():
    secure_config = RetellDBConfig(
        storage=StorageConfig(backend="memory"),
        api_key="secret-token-123"
    )
    app = create_app(secure_config)
    client = TestClient(app)

    # Unauthorized request
    resp = client.get("/v1/status")
    assert resp.status_code == 401

    # Authorized request
    resp = client.get("/v1/status", headers={"X-API-Key": "secret-token-123"})
    assert resp.status_code == 200
    resp = client.get("/v1/profile/hackathon", headers={"X-API-Key": "secret-token-123"})
    assert resp.status_code == 404  # nothing saved for this persona
