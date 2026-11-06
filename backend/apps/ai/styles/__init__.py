"""API styles: how a request to a provider is built and its answer read (see `base.ApiStyle`)."""

from __future__ import annotations

from .base import ApiStyle, ConfigError, Connection, OutgoingRequest, RemoteModel, StyleConfig
from .custom import CustomStyle
from .doory import DooryStyle
from .json_b64 import JsonStyle
from .mask import MaskStyle
from .multipart import MultipartStyle
from .queue import QueueStyle

STYLES: dict[str, ApiStyle] = {
    style.name: style
    for style in (DooryStyle(), MultipartStyle(), JsonStyle(), MaskStyle(), CustomStyle(), QueueStyle())
}


def get_style(name: str) -> ApiStyle:
    try:
        return STYLES[name]
    except KeyError:
        raise ConfigError(f"Unknown API style {name!r}; use one of: {', '.join(STYLES)}.") from None


__all__ = [
    "STYLES",
    "ApiStyle",
    "ConfigError",
    "Connection",
    "OutgoingRequest",
    "RemoteModel",
    "StyleConfig",
    "get_style",
]
