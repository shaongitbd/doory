"""Custom: every setting open, for servers no preset fits."""

from __future__ import annotations

from .base import READERS, ApiStyle


class CustomStyle(ApiStyle):
    name = "custom"
    label = "Custom"
    help = (
        "Settings: method (POST or PUT), path (may contain {task} and {model}), body (multipart or json), "
        "send_as (file, base64 or data-url; a JSON body has no file), file_field, model_field, "
        "options_field, option_fields, extra_fields, extra_headers, "
        "response (image, mask, json:<path> or json-mask:<path>)."
    )
    keys = frozenset(READERS) - {"response_path"}
    fixed = {}
