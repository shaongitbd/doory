"""What every API style shares: the style configuration, the outgoing request, and the generic building and
parsing that the presets restrict.

A style turns (provider, task, model, image, options) into one HTTP request and the answer into a PNG. The
presets (multipart, json, mask) are the custom style with most settings fixed, so they behave the same way.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Literal
from urllib.parse import quote, unquote_plus, urlsplit

import urllib3

from ..errors import AIProviderError
from ..results import SourceImage, from_image, from_mask
from ..tasks import Task
from ..transport import _UNSAFE_URL_CHARS, HttpResponse, Policy

MAX_FIELDS = 20
MAX_FIELD_NAME = 100
MAX_FIELD_VALUE = 2000
MAX_PATH = 500
_TOKEN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")  # an HTTP header name (RFC 9110 token)
_FIELD_NAME = re.compile(r"^[A-Za-z0-9_.\-\[\]]+$")
_JSON_PATH = re.compile(r"^[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)*$")
#: Headers Doory sets itself; a style may not override them.
RESERVED_HEADERS = frozenset(
    {"host", "content-length", "content-type", "transfer-encoding", "connection", "cookie", "user-agent"}
)


class ConfigError(ValueError):
    """The style configuration is not valid; the message says which setting and why."""


@dataclass(frozen=True)
class StyleConfig:
    """Every knob of the custom style. The presets fix some of them (see each style's `fixed`)."""

    method: Literal["POST", "PUT"] = "POST"
    path: str = ""  # appended to the base URL; may contain {task} and {model}
    body: Literal["multipart", "json"] = "multipart"
    #: How the image is sent: a file upload (multipart only), base64, or a `data:` URL of the base64. A JSON
    #: body never has a file: there it is base64 unless set to data-url.
    send_as: Literal["file", "base64", "data-url"] = "file"
    file_field: str = "file"
    model_field: str = "model"  # empty: the model is not sent
    options_field: str = ""  # empty: each task option is its own field; else one JSON field
    #: Task option → the field it is sent as; an empty name leaves that option out of the request.
    option_fields: Mapping[str, str] = field(default_factory=dict)
    extra_fields: Mapping[str, Any] = field(default_factory=dict)
    extra_headers: Mapping[str, str] = field(default_factory=dict)
    response: Literal["image", "mask", "auto"] = "image"  # auto: an image, or JSON with `response_path`
    response_format: Literal["binary", "json"] = "binary"
    response_path: str = "image_b64"


@dataclass(frozen=True)
class OutgoingRequest:
    method: str
    url: str
    headers: dict[str, str]
    body: bytes

    def __repr__(self) -> str:  # never the headers: they may carry the secret
        return f"OutgoingRequest({self.method}, {len(self.body)} bytes)"


@dataclass(frozen=True)
class RemoteModel:
    remote_name: str
    label: str
    tasks: tuple[str, ...]


class Connection:
    """What a style needs to talk to one provider. `auth_value` never appears in a repr."""

    def __init__(
        self,
        *,
        ref: str,
        name: str,
        base_url: str,
        style: str,
        config: StyleConfig,
        auth_header: str,
        auth_value: str,
        timeout: float,
        max_image_bytes: int,
        policy: Policy,
    ):
        self.ref = ref
        self.name = name
        self.base_url = base_url
        self.style = style
        self.config = config
        self.auth_header = auth_header
        self._auth_value = auth_value
        self.timeout = timeout
        self.max_image_bytes = max_image_bytes
        self.policy = policy

    def __repr__(self) -> str:
        return f"Connection({self.ref}, {self.style})"

    def auth_headers(self) -> dict[str, str]:
        if self.auth_header and self._auth_value:
            return {self.auth_header: self._auth_value}
        return {}

    def url(self, path: str) -> str:
        """`path` (beginning with /) under the base URL; never another host."""
        url = self.base_url.rstrip("/") + path
        if urlsplit(url).netloc != urlsplit(self.base_url).netloc:
            raise AIProviderError("refused_address", "That server address is not allowed.")
        return url


#: (request, largest answer accepted) → the answer
Send = Callable[[OutgoingRequest, int], HttpResponse]


def _text(value: Any, name: str, *, limit: int = MAX_FIELD_VALUE) -> str:
    if not isinstance(value, str):
        raise ConfigError(f"{name} must be text.")
    if len(value) > limit or "\r" in value or "\n" in value or "\x00" in value:
        raise ConfigError(f"{name} is too long or contains line breaks.")
    return value


def _field_name(value: Any, name: str, *, allow_empty: bool = False) -> str:
    text = _text(value, name, limit=MAX_FIELD_NAME)
    if not text and allow_empty:
        return text
    if not _FIELD_NAME.match(text):
        raise ConfigError(f"{name} may only contain letters, digits and _ . - [ ].")
    return text


_AUTH_WORD_BOUNDARY = re.compile(
    r"(^|[_\-.])(auth|authorization|key|token|secret|cookie|passwd|password)($|[_\-.])",
    re.IGNORECASE,
)
_AUTH_SUBSTRINGS = ("token", "secret", "bearer", "apikey", "api-key", "api_key")


_AUTH_SCHEMES = re.compile(r"^\s*(bearer|basic|digest|token)\s", re.IGNORECASE)


def _is_auth_like(name: str) -> bool:
    clean = unquote_plus(name).strip().lower()
    return bool(_AUTH_WORD_BOUNDARY.search(clean) or any(sub in clean for sub in _AUTH_SUBSTRINGS))


def _path(value: Any) -> str:
    text = _text(value, "path", limit=MAX_PATH)
    if text and not text.startswith("/"):
        raise ConfigError("path must start with /.")
    if "#" in text or "//" in text or _UNSAFE_URL_CHARS.search(text):
        raise ConfigError("path contains characters that are not allowed.")
    if "?" in text:
        query = text.partition("?")[2]
        for part in query.split("&"):
            param = part.partition("=")[0].strip()
            if _is_auth_like(param):
                raise ConfigError(
                    f"Query parameter {param!r} looks like an authentication parameter; "
                    "use the provider's secret field instead."
                )
    return text


def _fields(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError("extra_fields must be an object.")
    if len(value) > MAX_FIELDS:
        raise ConfigError(f"extra_fields may have at most {MAX_FIELDS} entries.")
    out: dict[str, Any] = {}
    for key, item in value.items():
        _field_name(key, "An extra field name")
        if _is_auth_like(key):
            raise ConfigError(
                f"Field {key!r} looks like an authentication field; use the provider's secret field instead."
            )
        if isinstance(item, str):
            _text(item, f"extra_fields.{key}")
        elif not isinstance(item, (bool, int, float)) or item is None:
            raise ConfigError(f"extra_fields.{key} must be text, a number or true/false.")
        out[key] = item
    return out


def _option_fields(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ConfigError("option_fields must be an object.")
    if len(value) > MAX_FIELDS:
        raise ConfigError(f"option_fields may have at most {MAX_FIELDS} entries.")
    out: dict[str, str] = {}
    for key, item in value.items():
        _field_name(key, "An option name in option_fields")
        name = _field_name(item, f"option_fields.{key}", allow_empty=True)
        if name and _is_auth_like(name):
            raise ConfigError(
                f"Field {name!r} looks like an authentication field; use the provider's secret field instead."
            )
        out[key] = name
    return out


def check_header_name(value: Any, name: str = "The header name") -> str:
    text = _text(value, name, limit=MAX_FIELD_NAME)
    if not _TOKEN.match(text):
        raise ConfigError(f"{name} is not a valid HTTP header name.")
    if text.lower() in RESERVED_HEADERS:
        raise ConfigError(f"{name} {text} is set by Doory and cannot be changed.")
    return text


def _headers(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ConfigError("extra_headers must be an object.")
    if len(value) > MAX_FIELDS:
        raise ConfigError(f"extra_headers may have at most {MAX_FIELDS} entries.")
    out: dict[str, str] = {}
    for key, item in value.items():
        header_name = check_header_name(key, "An extra header")
        if _is_auth_like(header_name):
            raise ConfigError(
                f"Header {header_name!r} looks like an authentication header; "
                "use the provider's auth_header and secret fields instead."
            )
        header_val = _text(item, f"extra_headers.{key}")
        if _AUTH_SCHEMES.match(header_val):
            raise ConfigError(
                f"Header {header_name!r} carries credentials; "
                "use the provider's auth_header and secret fields instead."
            )
        try:
            header_name.encode("latin-1")
            header_val.encode("latin-1")
        except UnicodeEncodeError:
            raise ConfigError(f"Header {key!r} and its value must contain only Latin-1 characters.")
        out[header_name] = header_val
    return out


def _choice(value: Any, name: str, choices: tuple[str, ...]) -> str:
    if value not in choices:
        raise ConfigError(f"{name} must be one of: {', '.join(choices)}.")
    return value


def _json_path(value: Any) -> str:
    text = _text(value, "response_path", limit=200)
    if not _JSON_PATH.match(text):
        raise ConfigError("response_path must be a dot path such as data.image (list items by number).")
    return text


def _response(value: Any) -> dict[str, str]:
    """The custom style's `response`: image (or png), mask, json:<path> or json-mask:<path>."""
    text = _text(value, "response", limit=220)
    if text in ("image", "png"):
        return {"response": "image", "response_format": "binary"}
    if text == "mask":
        return {"response": "mask", "response_format": "binary"}
    for prefix, kind in (("json:", "image"), ("json-mask:", "mask")):
        if text.startswith(prefix):
            return {
                "response": kind,
                "response_format": "json",
                "response_path": _json_path(text[len(prefix) :]),
            }
    raise ConfigError("response must be image, mask, json:<path> or json-mask:<path>.")


#: style_config key → reader returning the StyleConfig fields it sets
READERS: dict[str, Callable[[Any], dict[str, Any]]] = {
    "method": lambda v: {"method": _choice(v, "method", ("POST", "PUT"))},
    "path": lambda v: {"path": _path(v)},
    "body": lambda v: {"body": _choice(v, "body", ("multipart", "json"))},
    "send_as": lambda v: {"send_as": _choice(v, "send_as", ("file", "base64", "data-url"))},
    "file_field": lambda v: {"file_field": _field_name(v, "file_field")},
    "model_field": lambda v: {"model_field": _field_name(v, "model_field", allow_empty=True)},
    "options_field": lambda v: {"options_field": _field_name(v, "options_field", allow_empty=True)},
    "option_fields": lambda v: {"option_fields": _option_fields(v)},
    "extra_fields": lambda v: {"extra_fields": _fields(v)},
    "extra_headers": lambda v: {"extra_headers": _headers(v)},
    "response_path": lambda v: {"response_path": _json_path(v)},
    "response": _response,
}


class ApiStyle:
    """A preset: which settings an operator may change (`keys`) and the values of the others (`fixed`)."""

    name: str = ""
    label: str = ""
    help: str = ""
    keys: frozenset[str] = frozenset()
    fixed: Mapping[str, Any] = {}
    can_list_models = False

    def config(self, raw: Any) -> StyleConfig:
        """The style configuration from the stored JSON, or ConfigError."""
        if raw in (None, ""):
            raw = {}
        if not isinstance(raw, dict):
            raise ConfigError("The style settings must be a JSON object.")
        unknown = sorted(set(raw) - self.keys)
        if unknown:
            allowed = ", ".join(sorted(self.keys)) or "none"
            raise ConfigError(f"The {self.label} style has no setting {unknown[0]} (it accepts: {allowed}).")
        values: dict[str, Any] = dict(self.fixed)
        for key, value in raw.items():
            values.update(READERS[key](value))
        config = replace(StyleConfig(), **values)
        if config.body == "json" and config.send_as == "file":
            config = replace(config, send_as="base64")
        taken = {config.file_field, config.model_field, config.options_field, *config.extra_fields} - {""}
        for option, name in config.option_fields.items():
            if name in taken:
                raise ConfigError(
                    f"option_fields.{option} sends the option as {name!r}, a field already in use."
                )
        return config

    # -- requests ----------------------------------------------------------------------------------------

    def path(self, connection: Connection, task: Task, model: str) -> str:
        path = connection.config.path
        return path.replace("{task}", quote(task.id, safe="")).replace("{model}", quote(model, safe=""))

    def fields(self, connection: Connection, model: str, options: Mapping[str, Any]) -> dict[str, Any]:
        config = connection.config
        values: dict[str, Any] = dict(config.extra_fields)
        if model and config.model_field:
            values[config.model_field] = model
        if config.option_fields:
            renamed = {config.option_fields.get(key, key): value for key, value in options.items()}
            options = {key: value for key, value in renamed.items() if key}
        if options:
            if config.options_field:
                values[config.options_field] = dict(options)
            else:
                values.update(options)
        return values

    def build(
        self, connection: Connection, task: Task, model: str, image: SourceImage, options: Mapping[str, Any]
    ) -> OutgoingRequest:
        config = connection.config
        values = self.fields(connection, model, options)
        accept = "application/json" if config.response_format == "json" else "image/png, image/*;q=0.9"
        if config.response == "auto":
            accept = "image/png, application/json;q=0.9"
        headers = {**config.extra_headers, **connection.auth_headers(), "Accept": accept}
        encoded = base64.b64encode(image.data).decode("ascii")
        if config.send_as == "data-url":
            encoded = f"data:{image.mime};base64,{encoded}"
        if config.body == "json":
            body = json.dumps({**values, config.file_field: encoded}).encode()
            headers["Content-Type"] = "application/json"
        else:
            form: dict[str, Any] = {
                key: value if isinstance(value, str) else json.dumps(value) for key, value in values.items()
            }
            if config.send_as == "file":
                form[config.file_field] = (image.filename, image.data, image.mime)
            else:
                form[config.file_field] = encoded
            body, content_type = urllib3.encode_multipart_formdata(form)
            headers["Content-Type"] = content_type
        url = connection.url(self.path(connection, task, model))
        return OutgoingRequest(config.method, url, headers, body)

    # -- answers -----------------------------------------------------------------------------------------

    def parse(
        self,
        connection: Connection,
        task: Task,
        response: HttpResponse,
        image: SourceImage,
        options: Mapping[str, Any] | None = None,
    ) -> bytes:
        """The finished image (see `results.from_image`) from the provider's answer to a request made with the
        task `options`."""
        expect_ok(response)
        config = connection.config
        as_json = config.response_format == "json" or (
            config.response == "auto" and response.content_type in ("application/json", "text/json")
        )
        data = image_from_json(response, config.response_path) if as_json else response.body
        if as_json is False and response.content_type in (
            "application/json",
            "text/json",
            "text/html",
            "text/plain",
        ):
            raise AIProviderError("not_image", "The server answered with text instead of an image.")
        if config.response == "mask":
            return from_mask(task, image, data)
        return from_image(task, image, data, options)

    def list_models(self, connection: Connection, send: Send) -> list[RemoteModel]:
        raise AIProviderError("not_supported", "This API style cannot list models; enter them by hand.")


def expect_ok(response: HttpResponse) -> None:
    """AIProviderError for any answer that is not a success."""
    status = response.status
    if 200 <= status < 300:
        return
    if status in (401, 403):
        raise AIProviderError("auth_failed", "The server refused the credentials.")
    if status == 413:
        raise AIProviderError("too_large", "The server refused the image as too large.")
    if status == 429:
        raise AIProviderError("busy", "The server is busy. Try again shortly.")
    if status == 404:
        raise AIProviderError("bad_response", "The server has no such endpoint or model (HTTP 404).")
    if 400 <= status < 500:
        raise AIProviderError("bad_response", f"The server could not process the request (HTTP {status}).")
    raise AIProviderError("bad_response", f"The server failed (HTTP {status}).")


MAX_JSON_CONTAINERS = 10_000


def load_json(response: HttpResponse) -> Any:
    """The answer parsed as JSON. Its size is already capped by the read limit of the request; an answer made
    of many small objects or lists (which take far more memory than their bytes) is refused before parsing.
    Base64 never contains `{` or `[`, so a real answer has only a handful."""
    if response.body.count(b"{") + response.body.count(b"[") > MAX_JSON_CONTAINERS:
        raise AIProviderError("bad_response", "The server's answer is not the JSON expected.")
    try:
        return json.loads(response.body)
    except (ValueError, RecursionError) as exc:
        raise AIProviderError("bad_response", "The server's answer is not valid JSON.") from exc


def _walk(data: Any, path: str) -> Any:
    for part in path.split("."):
        if isinstance(data, dict) and part in data:
            data = data[part]
        elif isinstance(data, list) and part.isdigit() and int(part) < len(data):
            data = data[int(part)]
        else:
            raise AIProviderError("bad_response", f"The server's answer has no {path}.")
    return data


def image_from_json(response: HttpResponse, path: str) -> bytes:
    """The base64 image (plain or a data: URL) at `path` of a JSON answer."""
    value = _walk(load_json(response), path)
    if not isinstance(value, str):
        raise AIProviderError("bad_response", f"The server's {path} is not a base64 image.")
    if value.startswith("data:"):
        value = value.partition(",")[2]
    try:
        return base64.b64decode("".join(value.split()), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AIProviderError("bad_response", f"The server's {path} is not a base64 image.") from exc
