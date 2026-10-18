"""Doory reference AI server: background removal behind Doory's contract
(backend/apps/ai/contract/openapi.yaml).

- `GET  /v1/models`: the models this server offers
- `POST /v1/{task}`: run a task (`background-removal`) on one image
- `GET  /health`: liveness

Only models with open licences (Apache-2.0, MIT), run on the CPU through ONNX Runtime. Doory calls it from its
backend only: there is no CORS, and with `API_KEY` set every route but `/health` needs the key.
"""

from __future__ import annotations

import asyncio
import base64
import hmac
import io
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Form, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.exceptions import HTTPException as StarletteHTTPException

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger("doory-ai-server")

TASK = "background-removal"

# Every model this server knows (rembg names). Only the AVAILABLE_MODELS among them are offered or accepted.
CATALOG_MODELS: dict[str, dict[str, Any]] = {
    "isnet-general-use": {"label": "Balanced", "license": "Apache-2.0"},
    "u2net": {"label": "High quality", "license": "Apache-2.0"},
    "u2netp": {"label": "Fast", "license": "Apache-2.0"},
    "birefnet-general-lite": {"label": "Fine edges (needs about 6-8 GB RAM)", "license": "MIT"},
}
DEFAULT_ACTIVE = "isnet-general-use,u2netp"

# Doory's own limits (backend/apps/core/images.py).
MAX_DIMENSION = 12_000
MAX_PIXELS = 80_000_000
FORMATS = ["PNG", "JPEG", "WEBP"]


def _env_int(name: str, default: int) -> int:
    try:
        return max(int(os.environ.get(name, default)), 1)
    except ValueError:
        return default


def active_models(raw: str | None = None) -> list[str]:
    """AVAILABLE_MODELS, in order, limited to the catalogue; the default set when nothing valid is listed."""
    raw = os.environ.get("AVAILABLE_MODELS", DEFAULT_ACTIVE) if raw is None else raw
    ids = [m.strip() for m in raw.split(",") if m.strip() in CATALOG_MODELS]
    return list(dict.fromkeys(ids)) or DEFAULT_ACTIVE.split(",")


ACTIVE_MODELS = active_models()
_wanted_default = os.environ.get("DEFAULT_MODEL", "").strip()
DEFAULT_MODEL = _wanted_default if _wanted_default in ACTIVE_MODELS else ACTIVE_MODELS[0]
MAX_IMAGE_BYTES = _env_int("MAX_IMAGE_BYTES", 25 * 1024 * 1024)
MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024  # the image plus the form's other fields
WORKERS = _env_int("WORKERS", 1)
TIMEOUT_SECONDS = _env_int("TIMEOUT_SECONDS", 60)
API_KEY = os.environ.get("API_KEY", "").strip()
# Without a key anyone who reaches the server can use it, so it only starts keyless when told to.
ALLOW_NO_KEY = os.environ.get("ALLOW_NO_KEY", "").strip().lower() in ("1", "true", "yes")

_sessions: dict[str, Any] = {}
_session_lock = threading.Lock()
_slots = threading.BoundedSemaphore(WORKERS)


def error(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message}}, headers=headers
    )


def get_session(model: str) -> Any:
    with _session_lock:
        if model not in _sessions:
            from rembg import new_session

            logger.info("loading model %s", model)
            _sessions[model] = new_session(model)
        return _sessions[model]


def run_background_removal(image_bytes: bytes, model: str) -> bytes:
    from rembg import remove

    return remove(image_bytes, session=get_session(model))


def _run_in_slot(image_bytes: bytes, model: str) -> bytes:
    """Runs in a worker thread that already holds a slot; frees it when the work ends (even after a timeout,
    so a slow image keeps its slot until it is really done)."""
    try:
        return run_background_removal(image_bytes, model)
    finally:
        _slots.release()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not API_KEY and not ALLOW_NO_KEY:
        raise RuntimeError("Set API_KEY (or ALLOW_NO_KEY=true for a server nobody else can reach).")
    for model in [m.strip() for m in os.environ.get("PRELOAD_MODELS", "").split(",") if m.strip()]:
        if model in ACTIVE_MODELS:
            await asyncio.to_thread(get_session, model)
    logger.info("started; models %s, default %s", ",".join(ACTIVE_MODELS), DEFAULT_MODEL)
    yield
    _sessions.clear()


app = FastAPI(
    title="Doory-compatible AI server",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _authorized(request: Request) -> bool:
    if not API_KEY:
        return True
    auth = request.headers.get("authorization", "")
    token = (
        auth[7:].strip() if auth[:7].lower() == "bearer " else request.headers.get("x-api-key", "").strip()
    )
    return bool(token) and hmac.compare_digest(token.encode(), API_KEY.encode())


class _TooLarge(Exception):
    pass


def _all_busy() -> bool:
    """Whether every slot is taken; checked before an upload is read, so a busy server doesn't take it in."""
    if _slots.acquire(blocking=False):
        _slots.release()
        return False
    return True


_CODES = {400: "invalid_request", 404: "not_found", 405: "method_not_allowed"}


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    """FastAPI's own errors in the contract's shape. A body cut at the limit while the form is parsed comes
    here as a 400 (FastAPI wraps the error), so it is answered as the 413 it is."""
    if request.scope.get("doory_too_large"):
        return error(413, "too_large", "The image is too large.")
    return error(exc.status_code, _CODES.get(exc.status_code, "error"), "The request was not accepted.")


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    return error(400, "invalid_request", "Send the image as the `image` field of a multipart form.")


@app.middleware("http")
async def guard(request: Request, call_next):
    """Checks the key and the body size before anything reads the body."""
    if request.url.path != "/health" and not _authorized(request):
        return error(401, "unauthorized", "Missing or invalid credentials.")
    if request.method == "POST":
        if request.url.path.startswith("/v1/") and _all_busy():
            return error(429, "busy", "The server is busy. Try again shortly.", {"Retry-After": "5"})
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
            return error(413, "too_large", "The image is too large.")
        received = 0
        receive = request._receive

        async def limited():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > MAX_BODY_BYTES:
                request.scope["doory_too_large"] = True
                raise _TooLarge
            return message

        request._receive = limited
        try:
            return await call_next(request)
        except _TooLarge:
            return error(413, "too_large", "The image is too large.")
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/v1/models")
async def list_models():
    """The offered models, the default first."""
    ordered = [DEFAULT_MODEL] + [m for m in ACTIVE_MODELS if m != DEFAULT_MODEL]
    return {"models": [{"id": m, "label": CATALOG_MODELS[m]["label"], "tasks": [TASK]} for m in ordered]}


def _checked_image(data: bytes) -> str | None:
    """None for a PNG, JPEG or WebP within the limits, else the error code. Reads the header only."""
    try:
        with Image.open(io.BytesIO(data), formats=FORMATS) as image:
            width, height = image.size
    except Exception:
        return "invalid_image"
    if width > MAX_DIMENSION or height > MAX_DIMENSION or width * height > MAX_PIXELS:
        return "too_large"
    return None


@app.post("/v1/{task}")
async def run_task(task: str, request: Request, image: UploadFile, model: str | None = Form(None)):
    if task != TASK:
        return error(404, "not_found", "This task is not supported.")
    chosen = (model or "").strip() or DEFAULT_MODEL
    if chosen not in ACTIVE_MODELS:
        return error(400, "unknown_model", "This model is not offered (see /v1/models).")
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if not data:
        return error(400, "empty_image", "The image is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        return error(413, "too_large", "The image is too large.")
    problem = _checked_image(data)
    if problem == "too_large":
        return error(413, "too_large", f"At most {MAX_DIMENSION} pixels a side and {MAX_PIXELS} pixels.")
    if problem:
        return error(400, "invalid_image", "Send a PNG, JPEG or WebP image.")

    if not _slots.acquire(blocking=False):
        return error(429, "busy", "The server is busy. Try again shortly.", {"Retry-After": "5"})
    try:
        work = asyncio.get_running_loop().run_in_executor(None, _run_in_slot, data, chosen)
    except Exception:
        _slots.release()
        raise
    try:
        png = await asyncio.wait_for(asyncio.shield(work), TIMEOUT_SECONDS)
    except TimeoutError:
        return error(503, "timeout", "The image took too long.")
    except Exception:
        logger.exception("inference failed (model %s)", chosen)
        return error(500, "inference_error", "The image could not be processed.")

    accept = request.headers.get("accept", "").lower()
    if "application/json" in accept and "image/png" not in accept and "*/*" not in accept:
        return {"image_b64": base64.b64encode(png).decode("ascii")}
    return Response(content=png, media_type="image/png")
