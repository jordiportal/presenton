"""Artifact block that Brain persists from a pack runtime response.

Brain's generic processor looks for a top-level ``artifact`` with ``handler``
and ``external_id``. Only the calls that create a deck return it: polling the
status must not, or every poll would register another artifact.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from models.presentation_and_path import PresentationPathAndEditPath


PRESENTON_HANDLER = "presenton"
PRESENTATION_MIME = "application/vnd.brain.presentation+json"
DEFAULT_DECK_NAME = "Presentación"
MAX_NAME_LENGTH = 120


class DeclaredArtifact(BaseModel):
    handler: str
    external_id: str
    mime: str
    name: str
    uri: str
    description: Optional[str] = None
    slide_count: Optional[int] = None


class GeneratedDeck(PresentationPathAndEditPath):
    artifact: DeclaredArtifact


class CreatedDeck(BaseModel):
    """A deck awaiting its outline: the presentation row plus the artifact."""

    model_config = ConfigDict(extra="allow")

    id: uuid.UUID
    artifact: DeclaredArtifact


class QueuedDeckGeneration(BaseModel):
    id: str
    type: str
    status: str
    message: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    data: Optional[dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    artifact: DeclaredArtifact


def deck_name(title: Optional[str] = None, content: Optional[str] = None) -> str:
    for candidate in (title, content):
        for line in (candidate or "").splitlines():
            text = line.strip().lstrip("#").strip()
            if text:
                return text[:MAX_NAME_LENGTH]
    return DEFAULT_DECK_NAME


def deck_artifact(
    presentation_id: uuid.UUID | str,
    name: str,
    slide_count: Optional[int] = None,
) -> DeclaredArtifact:
    deck_id = str(presentation_id)
    return DeclaredArtifact(
        handler=PRESENTON_HANDLER,
        external_id=deck_id,
        mime=PRESENTATION_MIME,
        name=name,
        uri=f"presenton://deck/{deck_id}",
        description=f"Deck Presenton {deck_id}",
        slide_count=slide_count,
    )
