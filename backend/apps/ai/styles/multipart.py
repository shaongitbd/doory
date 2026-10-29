"""Multipart → image: the source in a file field, fixed form fields, a PNG with transparency back. Fits most
self-hosted model servers and many external APIs."""

from __future__ import annotations

from .base import ApiStyle


class MultipartStyle(ApiStyle):
    name = "multipart"
    label = "Multipart → image"
    help = (
        'Settings: path (e.g. "/remove"), file_field (default "file"), model_field (default "model"; '
        "empty: not sent), options_field, option_fields (task option → field name; empty: not sent), "
        "extra_fields (fixed form fields), extra_headers."
    )
    keys = frozenset(
        {
            "path",
            "file_field",
            "model_field",
            "options_field",
            "option_fields",
            "extra_fields",
            "extra_headers",
        }
    )
    fixed = {"body": "multipart", "send_as": "file", "response": "image", "response_format": "binary"}
