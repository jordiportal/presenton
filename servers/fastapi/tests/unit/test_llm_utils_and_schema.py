from llmai.shared import JSONObjectResponse, ReasoningEffortValue

from utils.llm_utils import (
    STRUCTURED_OUTPUT_TOKEN_FLOOR,
    extract_structured_content,
    get_generate_kwargs,
    serialize_structured_content,
)
from utils.schema_utils import (
    ensure_array_schemas_have_items,
    get_schema_validation_errors,
)


def test_structured_kwargs_default_to_low_reasoning_and_token_floor(monkeypatch):
    monkeypatch.setenv("LLM", "custom")
    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    monkeypatch.delenv("LLM_MAX_OUTPUT_TOKENS", raising=False)
    monkeypatch.delenv("LLM_REASONING_MODE", raising=False)

    kwargs = get_generate_kwargs(
        "glm-test",
        [],
        response_format=JSONObjectResponse(),
    )

    assert kwargs["max_tokens"] == STRUCTURED_OUTPUT_TOKEN_FLOOR
    assert kwargs["reasoning"].effort == ReasoningEffortValue.LOW


def test_structured_kwargs_keep_explicit_reasoning_effort(monkeypatch):
    monkeypatch.setenv("LLM", "custom")
    monkeypatch.setenv("LLM_REASONING_EFFORT", "medium")
    monkeypatch.setenv("LLM_MAX_OUTPUT_TOKENS", "4096")

    kwargs = get_generate_kwargs(
        "glm-test",
        [],
        response_format=JSONObjectResponse(),
    )

    assert kwargs["max_tokens"] == 4096
    assert kwargs["reasoning"].effort == ReasoningEffortValue.MEDIUM


def test_extract_structured_content_from_json_text():
    payload = extract_structured_content('{"slides": [{"content": "A"}]}')
    assert payload == {"slides": [{"content": "A"}]}


def test_serialize_structured_content_prefers_json_serialization():
    serialized = serialize_structured_content({"slides": [{"content": "A"}]})
    assert serialized == '{"slides": [{"content": "A"}]}'


def test_get_schema_validation_errors_reports_path_and_message():
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "maxLength": 5},
        },
        "required": ["title"],
        "additionalProperties": False,
    }
    errors = get_schema_validation_errors(schema, {"title": "too long title"}, strict=False)
    assert errors
    assert any("too long" in e.lower() for e in errors)


def test_ensure_array_schemas_have_items_adds_missing_items_recursively():
    schema = {
        "type": "object",
        "properties": {
            "slides": {
                "type": "array",
                "items": {"type": "object", "properties": {"tags": {"type": "array"}}},
            }
        },
    }

    fixed = ensure_array_schemas_have_items(schema)

    assert fixed["properties"]["slides"]["items"]["properties"]["tags"]["items"] == {
        "type": "string"
    }
