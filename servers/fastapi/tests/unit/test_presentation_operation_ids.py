from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER


def _operation_ids() -> dict[tuple[str, str], str]:
    found: dict[tuple[str, str], str] = {}
    for route in PRESENTATION_ROUTER.routes:
        methods = getattr(route, "methods", None) or set()
        operation_id = getattr(route, "operation_id", None)
        path = getattr(route, "path", "")
        if not operation_id:
            continue
        for method in methods:
            found[(path, method.lower())] = operation_id
    return found


def test_pack_tools_tienen_operation_id_estable():
    ids = _operation_ids()
    assert ids[("/generate", "post")] == "generate_presentation"
    assert ids[("/generate/async", "post")] == "generate_presentation_async"
    assert ids[("/status/{id}", "get")] == "get_presentation_generation_status"
    assert ids[("/{id}/export", "post")] == "export_presentation"
