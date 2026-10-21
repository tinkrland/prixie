"""
FastAPI application for RetellDB hosted API.
"""

from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from retelldb.models.persona import PersonaProfile
from retelldb.models.query import (
    QueryRequest,
    QueryResponse,
    IngestRequest,
    IngestResponse,
    GraphStatusResponse,
)
from retelldb.config import RetellDBConfig, default_config
from retelldb.storage.memory_store import MemoryGraphStore, MemoryVectorStore
from retelldb.storage.falkordb_store import FalkorDBStore
from retelldb.storage.pgvector_store import PGVectorStore
from retelldb.ingestion.pipeline import IngestionPipeline
from retelldb.routing.engine import RetrievalEngine

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def create_app(config: RetellDBConfig = default_config) -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="RetellDB API",
        version="0.2.0",
        description="Persona memory retrieval layer for agents that actually know things."
    )

    # Valid CORS specification: allow_credentials cannot be True when allow_origins=["*"]
    is_wildcard = "*" in config.allowed_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.allowed_origins,
        allow_credentials=not is_wildcard,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Initialize storage & engines
    if config.storage.backend == "memory":
        graph_store = MemoryGraphStore()
        vector_store = MemoryVectorStore()
    else:
        graph_store = FalkorDBStore(config.storage)
        vector_store = PGVectorStore(config.storage)

    pipeline = IngestionPipeline(graph_store, vector_store, config)
    engine = RetrievalEngine(graph_store, vector_store, config)

    def verify_api_key(key: Optional[str] = Security(api_key_header)):
        # unset key = CLOSED (the owner, oct 21 2026): a retelldb without an
        # api key configured refuses requests rather than letting them
        # all through. a misconfigured deployment fails loudly, never
        # silently open.
        if not config.api_key:
            raise HTTPException(
                status_code=503,
                detail="retelldb api key is not configured (RETELLDB_API_KEY). refusing all requests. closed is closed.",
            )
        if not key or key != config.api_key:
            raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")
        return key

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "retelldb",
            "storage_backend": config.storage.backend,
            "embedding_mode": pipeline.embedder.provider_info
        }

    @app.post("/v1/query", response_model=QueryResponse, dependencies=[Depends(verify_api_key)])
    def query_memory(request: QueryRequest):
        try:
            result = engine.retrieve(request)
            return QueryResponse(success=True, result=result)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/v1/ingest", response_model=IngestResponse, dependencies=[Depends(verify_api_key)])
    def ingest_memory(request: IngestRequest):
        try:
            resp = pipeline.ingest(
                content=request.content,
                format=request.format,
                persona_id=request.persona_id,
                namespace=request.namespace,
                title=request.title,
                source_uri=request.source_uri,
                metadata=request.metadata
            )
            return resp
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/v1/status", response_model=GraphStatusResponse, dependencies=[Depends(verify_api_key)])
    def graph_status(persona_id: Optional[str] = None):
        try:
            from retelldb.models.schema import normalize_namespace
            ns = normalize_namespace(persona_id)
            persona_graph = config.storage.graph_for(ns)
            shared_graph = config.storage.graph_for("shared")
            embed_status = pipeline.embedder.get_status()
            return GraphStatusResponse(
                persona_graph=graph_store.get_status(persona_graph),
                shared_graph=graph_store.get_status(shared_graph),
                embedding_subsystem=embed_status
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/v1/profile", response_model=IngestResponse, dependencies=[Depends(verify_api_key)])
    def save_persona_profile(profile: PersonaProfile):
        try:
            from retelldb.persona_store import save_profile
            return save_profile(graph_store, config, profile)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/v1/profile/{persona_id}", dependencies=[Depends(verify_api_key)])
    def get_persona_profile(persona_id: str):
        from retelldb.persona_store import load_profile
        profile = load_profile(graph_store, config, persona_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="no profile saved for this persona")
        return profile

    return app


app = create_app()
