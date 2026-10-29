"""JSON → base64: the source as base64 (or a data: URL) in a JSON body, or a multipart upload; a JSON answer
with the result as base64 (or a data: URL) at a dot path."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from .base import ApiStyle, StyleConfig


class JsonStyle(ApiStyle):
    name = "json"
    label = "JSON → base64"
    help = (
        'Settings: path, body ("json" or "multipart"; default json), send_as ("base64" or "data-url"; '
        'default base64), file_field (default "image"), model_field, options_field, option_fields (task '
        "option → field name; empty: not sent), extra_fields, extra_headers, response_path (dot path of the "
        'result, default "image_b64", e.g. "data.0.b64").'
    )
    keys = frozenset(
        {
            "path",
            "body",
            "send_as",
            "file_field",
            "model_field",
            "options_field",
            "option_fields",
            "extra_fields",
            "extra_headers",
            "response_path",
        }
    )
    fixed = {
        "body": "json",
        "send_as": "base64",
        "file_field": "image",
        "response": "image",
        "response_format": "json",
    }

    def config(self, raw: Any) -> StyleConfig:
        config = super().config(raw)
        if config.body == "multipart":  # the image as an upload, the answer still JSON
            config = replace(config, send_as="file")
        return config
