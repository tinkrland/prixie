"""
Base normalizer interface and normalized document representations.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from retelldb.models.schema import NodeType, EdgeType, generate_node_id, generate_edge_id
import uuid


class CandidateNode(BaseModel):
    """A candidate node extracted by a normalizer before LLM extraction pass."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    type: NodeType
    content: str = ""
    namespace: str = "shared"
    tags: List[str] = Field(default_factory=list)
    source_uri: Optional[str] = None
    locator: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def create_deterministic(
        cls,
        title: str,
        type: NodeType,
        namespace: str,
        source_uri: Optional[str],
        doc_title: str,
        locator: str,
        content: str = "",
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> "CandidateNode":
        det_id = generate_node_id(namespace, source_uri, doc_title, type.value, locator)
        return cls(
            id=det_id,
            title=title,
            type=type,
            content=content,
            namespace=namespace,
            tags=tags or [],
            source_uri=source_uri,
            locator=locator,
            metadata=metadata or {}
        )


class CandidateEdge(BaseModel):
    """A candidate relationship edge identified by structural links or doc syntax."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_id: str
    target_id: str
    type: EdgeType
    weight: float = 1.0
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def create_deterministic(
        cls,
        source_id: str,
        target_id: str,
        type: EdgeType,
        weight: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> "CandidateEdge":
        det_id = generate_edge_id(source_id, target_id, type.value)
        return cls(
            id=det_id,
            source_id=source_id,
            target_id=target_id,
            type=type,
            weight=weight,
            metadata=metadata or {}
        )


class NormalizedDocument(BaseModel):
    """The normalized output of any doc format."""
    document_title: str
    source_uri: Optional[str] = None
    namespace: str = "shared"
    nodes: List[CandidateNode] = Field(default_factory=list)
    edges: List[CandidateEdge] = Field(default_factory=list)
    global_tags: List[str] = Field(default_factory=list)


class BaseNormalizer(ABC):
    """Abstract base class for all document normalizers."""

    @abstractmethod
    def normalize(
        self, 
        content: str, 
        namespace: str = "shared", 
        title: Optional[str] = None,
        source_uri: Optional[str] = None,
        **kwargs
    ) -> NormalizedDocument:
        """Parse raw content into candidate nodes and edges."""
        pass
