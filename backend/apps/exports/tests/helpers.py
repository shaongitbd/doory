import io
import mimetypes
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from django.core.files.uploadedfile import SimpleUploadedFile
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from PIL import Image

PNG_RED_10X10: bytes
_buffer = io.BytesIO()
Image.new("RGB", (10, 10), (255, 0, 0)).save(_buffer, "PNG")
PNG_RED_10X10 = _buffer.getvalue()


def svg_page(width=400, height=300, fill="#336699", extra="", ident="a") -> bytes:
    """A small, valid editor-style page: gradient + rectangle (+ anything in `extra`)."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><defs><linearGradient id="{ident}"><stop offset="0" stop-color="{fill}"/>'
        f'<stop offset="1" stop-color="{fill}"/></linearGradient></defs>'
        f'<rect width="{width}" height="{height}" fill="url(#{ident})"/>{extra}</svg>'
    ).encode()


def upload(data: bytes, name="page.svg") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data, content_type="image/svg+xml")


def payload(pages, width=400, height=300, **extra) -> dict:
    return {
        "pages": [upload(page, f"page-{i}.svg") for i, page in enumerate(pages, start=1)],
        "width": width,
        "height": height,
        **extra,
    }


def build_test_font(family="Doory Test Sans", ps_name="DooryTestSans-Regular") -> bytes:
    """A tiny valid TrueType font with a single glyph ("A") so embedding can be verified in the PDF."""

    def square(left, right):
        pen = TTGlyphPen(None)
        pen.moveTo((left, 0))
        pen.lineTo((left, 700))
        pen.lineTo((right, 700))
        pen.lineTo((right, 0))
        pen.closePath()
        return pen.glyph()

    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder([".notdef", "A"])
    builder.setupCharacterMap({0x41: "A"})
    builder.setupGlyf({".notdef": square(50, 450), "A": square(100, 600)})
    builder.setupHorizontalMetrics({".notdef": (500, 50), "A": (700, 100)})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({"familyName": family, "styleName": "Regular", "psName": ps_name})
    builder.setupOS2(sTypoAscender=800, usWinAscent=800, usWinDescent=200)
    builder.setupPost()
    out = io.BytesIO()
    builder.save(out)
    return out.getvalue()


class Canary:
    """A local HTTP server that records every request path: proof of what the browser reached."""

    def __init__(self) -> None:
        canary = self
        self.hits: list[str] = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                canary.hits.append(self.path)
                if self.path.startswith("/media/redirect"):
                    self.send_response(302)
                    self.send_header("Location", "/secret/flag.png")
                    self.end_headers()
                    return
                if self.path.startswith("/media/slow"):
                    time.sleep(6)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                self.wfile.write(PNG_RED_10X10)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.origin = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class RenderSite:
    """Serves the built frontend (`dist/`) and `/media/` from the media root, like the web container, and records
    every request path: the render page of the image export, in the tests."""

    def __init__(self, dist: Path, media_root: Path) -> None:
        site = self
        self.hits: list[str] = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                site.hits.append(self.path)
                path = unquote(urlsplit(self.path).path)
                root, name = (
                    (media_root, path[len("/media/") :]) if path.startswith("/media/") else (dist, path[1:])
                )
                target = (root / name).resolve()
                if not target.is_file() or not target.is_relative_to(root.resolve()):
                    self.send_error(404)
                    return
                body = target.read_bytes()
                self.send_response(200)
                self.send_header(
                    "Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                )
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.origin = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
