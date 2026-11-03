"""Chat tools exposed as typed HTTP operations.

Brain consumes them through OpenAPI as ``presenton_deck_*`` (standard decks)
and ``presenton_deck_smart_*`` (Smart HTML decks). The body is flat:
``presentation_id`` plus the tool arguments with the same names the chat model
uses, so Brain can map its tool parameters 1:1. The schema is written inline
because Brain does not follow nested ``$ref``.
"""

import json
import re
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from llmai.shared import AssistantToolCall  # type: ignore[import-not-found]
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.presentation import PresentationModel
from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import OpenAIStrictSchemaModel
from services.chat.tools import ChatTools
from services.database import get_async_session
from services.presentation_access import require_presentation_access


OPS_ROUTER = APIRouter(prefix="/ops", tags=["Deck operations"])

DeckType = Literal["standard", "smart"]

# createComponent: alias of addComponent.
EXCLUDED_TOOLS = frozenset({"createComponent"})
READ_ONLY_PREFIXES = ("get", "search", "read")
RESERVED_FIELDS = ("presentation_id", "user_request")


class _CatalogMemory:
    def __init__(self, presentation_type: DeckType):
        self.presentation_type = presentation_type


def tool_catalog(presentation_type: DeckType) -> list[Any]:
    tools = ChatTools(_CatalogMemory(presentation_type)).get_tool_definitions()  # type: ignore[arg-type]
    return [tool for tool in tools if tool.name not in EXCLUDED_TOOLS]


def snake_case(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def operation_id(tool_name: str, presentation_type: DeckType) -> str:
    family = "deck_smart_" if presentation_type == "smart" else "deck_"
    return family + snake_case(tool_name)


def _inline_refs(node: Any, defs: dict[str, Any], stack: tuple[str, ...] = ()) -> Any:
    if isinstance(node, list):
        return [_inline_refs(item, defs, stack) for item in node]
    if not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        key = ref.rsplit("/", 1)[-1]
        if key in stack:
            return {"type": "object"}
        target = _inline_refs(defs.get(key, {}), defs, stack + (key,))
        extra = {k: _inline_refs(v, defs, stack) for k, v in node.items() if k != "$ref"}
        return {**target, **extra}
    return {
        key: _inline_refs(value, defs, stack)
        for key, value in node.items()
        if key != "$defs"
    }


def _is_nullable(schema: dict[str, Any]) -> bool:
    if schema.get("type") == "null":
        return True
    return any(
        isinstance(option, dict) and option.get("type") == "null"
        for option in schema.get("anyOf") or []
    )


def request_schema(tool: Any) -> dict[str, Any]:
    model = tool.input_schema
    raw = model.model_json_schema(by_alias=True)
    schema = _inline_refs(raw, raw.get("$defs") or {})
    properties = dict(schema.get("properties") or {})
    required = list(schema.get("required") or [])
    # The model fills missing nullable fields with None before validating.
    if isinstance(model, type) and issubclass(model, OpenAIStrictSchemaModel):
        required = [name for name in required if not _is_nullable(properties.get(name, {}))]
    return {
        "type": "object",
        "properties": {
            "presentation_id": {
                "type": "string",
                "format": "uuid",
                "description": "Presenton deck id (external_id of the Brain artifact).",
            },
            "user_request": {
                "type": "string",
                "description": (
                    "The user's request in their own words. Some tools infer chart "
                    "titles or table data from it."
                ),
            },
            **properties,
        },
        "required": ["presentation_id", *required],
    }


def _deck_type(presentation: PresentationModel) -> DeckType:
    return "smart" if presentation.generation_mode == "smart" else "standard"


async def _read_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Body must be a JSON object") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    return body


def _parse_presentation_id(value: Any) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="presentation_id must be a valid UUID",
        ) from exc


def _make_endpoint(tool_name: str, presentation_type: DeckType):
    write = not tool_name.startswith(READ_ONLY_PREFIXES)

    async def endpoint(
        request: Request,
        sql_session: AsyncSession = Depends(get_async_session),
    ) -> dict[str, Any]:
        body = await _read_body(request)
        presentation_id = _parse_presentation_id(body.pop("presentation_id", None))
        user_request = body.pop("user_request", None)

        presentation = await sql_session.get(PresentationModel, presentation_id)
        if not presentation:
            raise HTTPException(status_code=404, detail="Presentation not found")
        await require_presentation_access(sql_session, presentation, write=write)

        actual = _deck_type(presentation)
        if actual != presentation_type:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Deck {presentation_id} is {actual}; use "
                    f"{operation_id(tool_name, actual)} instead."
                    if any(t.name == tool_name for t in tool_catalog(actual))
                    else f"Deck {presentation_id} is {actual}; {tool_name} does not apply."
                ),
            )

        tools = ChatTools(
            PresentationContextStore(sql_session, presentation.id, presentation_type=actual)
        )
        tools.set_turn_context(user_request if isinstance(user_request, str) else "")
        return await tools.execute_tool_call(
            AssistantToolCall(
                id=f"ops-{uuid.uuid4().hex}",
                name=tool_name,
                arguments=json.dumps(body, ensure_ascii=False),
            )
        )

    endpoint.__name__ = operation_id(tool_name, presentation_type)
    return endpoint


def _register(presentation_type: DeckType) -> None:
    base = "/smart" if presentation_type == "smart" else ""
    for tool in tool_catalog(presentation_type):
        op_id = operation_id(tool.name, presentation_type)
        OPS_ROUTER.add_api_route(
            f"{base}/{snake_case(tool.name)}",
            _make_endpoint(tool.name, presentation_type),
            methods=["POST"],
            operation_id=op_id,
            summary=op_id,
            description=tool.description,
            openapi_extra={
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": request_schema(tool)}},
                }
            },
        )


_register("standard")
_register("smart")
