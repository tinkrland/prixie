"""
RetellDB Client SDK.
Supports both embedded in-process execution and remote HTTP hosted API communication.
"""

from typing import Optional, Dict, Any, Union
import os
import httpx
from retelldb.models.query import (
    QueryRequest,
    QueryResponse,
    SubGraphResult,
    IngestRequest,
    IngestResponse,
    IngestDocumentFormat,
    GraphStatusResponse,
)
from retelldb.config import RetellDBConfig, default_config
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from retelldb.models.persona import PersonaProfile
from retelldb.storage.memory_store import MemoryGraphStore, MemoryVectorStore
from retelldb.storage.falkordb_store import FalkorDBStore
from retelldb.storage.pgvector_store import PGVectorStore
from retelldb.ingestion.pipeline import IngestionPipeline
from retelldb.routing.engine import RetrievalEngine


class RetellDB:
    """Client for querying and ingesting documents into RetellDB."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        config: Optional[RetellDBConfig] = None,
        use_memory: bool = False,
        api_key: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/") if base_url else None
        self.config = config or default_config
        # remote mode: the server gate is fail-closed (the owner, oct 21
        # 2026), so an unkeyed client is refused outright. the key
        # comes from the argument or RETELLDB_API_KEY, and a missing
        # one is a loud constructor error, never a silent 401 loop.
        self.api_key = api_key or os.environ.get("RETELLDB_API_KEY")
        if self.base_url and not self.api_key:
            raise ValueError(
                "retelldb remote mode needs an api key (api_key= or RETELLDB_API_KEY). the server refuses unkeyed requests."
            )

        if self.base_url:
            self._http_client = httpx.Client(
                base_url=self.base_url,
                timeout=30.0,
                headers={"X-API-Key": self.api_key},
            )
            self._embedded = False
        else:
            self._embedded = True
            # Embedded initialization
            if use_memory or self.config.storage.backend == "memory":
                self.graph_store = MemoryGraphStore()
                self.vector_store = MemoryVectorStore()
            else:
                self.graph_store = FalkorDBStore(self.config.storage)
                self.vector_store = PGVectorStore(self.config.storage)

            self.pipeline = IngestionPipeline(self.graph_store, self.vector_store, self.config)
            self.engine = RetrievalEngine(self.graph_store, self.vector_store, self.config)

    def query(
        self,
        query: str,
        persona_id: Optional[str] = None,
        max_hops: int = 3,
        top_k: int = 5,
        include_edges: bool = True
    ) -> SubGraphResult:
        """Query a persona's memory graph via the routing layer."""
        req = QueryRequest(
            query=query,
            persona_id=persona_id,
            max_hops=max_hops,
            top_k=top_k,
            include_edges=include_edges
        )

        if not self._embedded:
            resp = self._http_client.post("/v1/query", json=req.model_dump())
            resp.raise_for_status()
            data = resp.json()
            return SubGraphResult.model_validate(data["result"])

        return self.engine.retrieve(req)

    def ingest(
        self,
        content: str,
        format: Union[str, IngestDocumentFormat] = "markdown",
        persona_id: Optional[str] = None,
        title: Optional[str] = None,
        source_uri: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> IngestResponse:
        """Ingest memory content into the persona's property graph and vector stores."""
        fmt_enum = IngestDocumentFormat(format) if isinstance(format, str) else format

        req = IngestRequest(
            content=content,
            format=fmt_enum,
            persona_id=persona_id,
            title=title,
            source_uri=source_uri,
            metadata=metadata or {}
        )

        if not self._embedded:
            resp = self._http_client.post("/v1/ingest", json=req.model_dump())
            resp.raise_for_status()
            return IngestResponse.model_validate(resp.json())

        return self.pipeline.ingest(
            content=req.content,
            format=req.format,
            persona_id=req.persona_id,
            namespace=req.namespace,
            title=req.title,
            source_uri=req.source_uri,
            metadata=req.metadata
        )

    def status(self, persona_id: Optional[str] = None) -> GraphStatusResponse:
        """Check status of a persona's memory graph and the shared graph."""
        if not self._embedded:
            params = {"persona_id": persona_id} if persona_id else {}
            resp = self._http_client.get("/v1/status", params=params)
            resp.raise_for_status()
            return GraphStatusResponse.model_validate(resp.json())

        from retelldb.models.schema import normalize_namespace
        ns = normalize_namespace(persona_id)
        persona_graph = self.config.storage.graph_for(ns)
        shared_graph = self.config.storage.graph_for("shared")
        embed_status = self.pipeline.embedder.get_status()
        return GraphStatusResponse(
            persona_graph=self.graph_store.get_status(persona_graph),
            shared_graph=self.graph_store.get_status(shared_graph),
            embedding_subsystem=embed_status
        )

    def save_profile(self, profile: "PersonaProfile") -> IngestResponse:
        """Persist a persona's voice profile into their own memory graph."""
        if not self._embedded:
            resp = self._http_client.post("/v1/profile", json=profile.model_dump())
            resp.raise_for_status()
            return IngestResponse.model_validate(resp.json())
        from retelldb.persona_store import save_profile
        return save_profile(self.graph_store, self.config, profile)

    def load_profile(self, persona_id: str) -> Optional["PersonaProfile"]:
        """Load a persona's voice profile from their memory graph."""
        if not self._embedded:
            resp = self._http_client.get(f"/v1/profile/{persona_id}")
            resp.raise_for_status()
            if resp.status_code == 404:
                return None
            return PersonaProfile.model_validate(resp.json())
        from retelldb.persona_store import load_profile
        return load_profile(self.graph_store, self.config, persona_id)
