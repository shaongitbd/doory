"""Mask: the source uploaded like the multipart style; the server answers with a black and white mask (any
size) that Doory applies to the source as its transparency. For segmentation-only servers."""

from __future__ import annotations

from .base import ApiStyle


class MaskStyle(ApiStyle):
    name = "mask"
    label = "Mask"
    help = (
        'Settings: path, file_field (default "file"), model_field, extra_fields, extra_headers. '
        "The answer is a mask image: white keeps, black removes."
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
    fixed = {"body": "multipart", "send_as": "file", "response": "mask", "response_format": "binary"}
