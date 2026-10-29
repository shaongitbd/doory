"""A local HTTP server standing in for AI providers, one route per API style:

* Provider X (multipart → PNG): `POST /api/remove`, file field `file`, form field `model`, no auth
* Provider Y (multipart → PNG with a key): `POST /v1/remove-background`, file field `image_file`, `X-Api-Key`
* Provider Z (JSON → base64): `POST /v1/segment`, JSON `{"image": <base64>}`, `Authorization: Bearer`, answers
  `{"data": {"result_b64": …}}`
* a mask server: `POST /mask` → a black and white mask of another size
* a Doory-compatible server: `GET /v1/models`, `POST /v1/{task}`
* an upscaler (multipart → PNG): `POST /upscale`, file field `file`, the factor in the form field `factor`
  (default 2)
* a hosted upscaler (JSON → base64): `POST /v1/images/generations`, JSON `{"image_url": <data: URL>}`,
  answers `{"data": [{"b64_json": …}]}` at three times the size, whatever was asked
"""

from __future__ import annotations

import base64
import json
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from typing import Any

from PIL import Image, ImageOps

Y_KEY = "y-secret-key-123"
Z_TOKEN = "z-secret-token-456"


@dataclass
class Received:
    method: str
    path: str
    headers: dict[str, str]
    body: bytes
    form: dict[str, tuple[str | None, bytes]] = field(default_factory=dict)
    json: Any = None


Answer = tuple[int, dict[str, str], bytes]
Handler = Callable[[Received], Answer]


def parse_form(content_type: str, body: bytes) -> dict[str, tuple[str | None, bytes]]:
    message = BytesParser(policy=HTTP).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body
    )
    form = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        form[name] = (part.get_filename(), part.get_payload(decode=True))
    return form


def png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def cutout(data: bytes) -> bytes:
    """The image with its left half made transparent."""
    image = ImageOps.exif_transpose(Image.open(BytesIO(data))).convert("RGBA")
    alpha = Image.new("L", image.size, 255)
    alpha.paste(0, (0, 0, image.width // 2, image.height))
    image.putalpha(alpha)
    return png(image)


def mask(data: bytes, size: tuple[int, int] | None = None) -> bytes:
    """A mask (left half black) at `size` (default: a fixed 20 x 10, unlike the source)."""
    width, height = size or (20, 10)
    image = Image.new("L", (width, height), 255)
    image.paste(0, (0, 0, width // 2, height))
    return png(image)


def enlarged(data: bytes, factor: int) -> bytes:
    image = Image.open(BytesIO(data)).convert("RGB")
    return png(image.resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST))


def image_answer(data: bytes) -> Answer:
    return 200, {"Content-Type": "image/png"}, data


def json_answer(data: Any, status: int = 200) -> Answer:
    return status, {"Content-Type": "application/json"}, json.dumps(data).encode()


def provider_x(request: Received) -> Answer:
    if "file" not in request.form:
        return json_answer({"error": "no file"}, 400)
    return image_answer(cutout(request.form["file"][1]))


def provider_y(request: Received) -> Answer:
    if request.headers.get("x-api-key") != Y_KEY:
        return json_answer({"error": "bad key"}, 403)
    return image_answer(cutout(request.form["image_file"][1]))


def provider_z(request: Received) -> Answer:
    if request.headers.get("authorization") != f"Bearer {Z_TOKEN}":
        return json_answer({"error": "unauthorized"}, 401)
    source = base64.b64decode(request.json["image"])
    return json_answer({"data": {"result_b64": base64.b64encode(cutout(source)).decode()}})


def mask_server(request: Received) -> Answer:
    return image_answer(mask(request.form["file"][1]))


def upscaler(request: Received) -> Answer:
    factor = int(request.form.get("factor", (None, b"2"))[1])
    return image_answer(enlarged(request.form["file"][1], factor))


def hosted_upscaler(request: Received) -> Answer:
    url = (request.json or {}).get("image_url", "")
    if not url.startswith("data:image/") or ";base64," not in url:
        return json_answer({"error": "image_url must be a URL or a data: URL"}, 400)
    result = enlarged(base64.b64decode(url.partition(",")[2]), 3)
    return json_answer({"data": [{"b64_json": base64.b64encode(result).decode()}]})


DOORY_MODELS = {
    "models": [
        {"id": "general-fast", "label": "Fast", "tasks": ["background-removal"]},
        {"id": "general-best", "label": "Best", "tasks": ["background-removal"]},
        {"id": "upscaler", "label": "Upscale", "tasks": ["upscale"]},
    ]
}


def doory_models(request: Received) -> Answer:
    return json_answer(DOORY_MODELS)


def doory_task(request: Received) -> Answer:
    if "image" not in request.form:
        return json_answer({"error": {"code": "no_image", "message": "No image."}}, 400)
    result = cutout(request.form["image"][1])
    model = request.form.get("model", (None, b""))[1].decode()
    if model == "general-best":  # answers in JSON, as a data: URL
        return json_answer({"image_b64": "data:image/png;base64," + base64.b64encode(result).decode()})
    return image_answer(result)


class FakeServer:
    def __init__(self) -> None:
        self.requests: list[Received] = []
        self.routes: dict[tuple[str, str], Handler] = {
            ("POST", "/api/remove"): provider_x,
            ("POST", "/v1/remove-background"): provider_y,
            ("POST", "/v1/segment"): provider_z,
            ("POST", "/mask"): mask_server,
            ("GET", "/v1/models"): doory_models,
            ("POST", "/v1/background-removal"): doory_task,
            ("POST", "/upscale"): upscaler,
            ("POST", "/v1/images/generations"): hosted_upscaler,
        }
        server = self

        class RequestHandler(BaseHTTPRequestHandler):
            def log_message(self, *args: Any) -> None:
                pass

            def handle_any(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                headers = {name.lower(): value for name, value in self.headers.items()}
                received = Received(self.command, self.path, headers, body)
                content_type = headers.get("content-type", "")
                if content_type.startswith("multipart/form-data"):
                    received.form = parse_form(content_type, body)
                elif content_type.startswith("application/json"):
                    received.json = json.loads(body)
                server.requests.append(received)
                handler = server.routes.get((self.command, self.path.split("?", 1)[0]))
                status, answer_headers, answer = (
                    handler(received) if handler else json_answer({"error": "no"}, 404)
                )
                self.send_response(status)
                for name, value in answer_headers.items():
                    self.send_header(name, value)
                if "Content-Length" not in answer_headers:
                    self.send_header("Content-Length", str(len(answer)))
                self.end_headers()
                self.wfile.write(answer)

            do_GET = do_POST = do_PUT = handle_any

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def start(self) -> FakeServer:
        self.thread.start()
        return self

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
