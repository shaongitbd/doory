"""Kraken.io: `KRAKEN_API_KEY` and `KRAKEN_API_SECRET`.

1. `POST https://api.kraken.io/v1/upload`, multipart: the image in `upload` and the options as JSON in `data`
   (`auth`, `wait: true`, and for JPG, WebP and AVIF `lossy` at the export's quality; PNG stays lossless).
2. `GET` the `kraked_url` of the answer for the file (it is kept there for an hour), only from a Kraken host.
"""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from django.conf import settings
from django.views.decorators.debug import sensitive_variables

from . import http
from .base import Job, OptimizerError

API = "https://api.kraken.io/v1/upload"
PRESERVE = ["profile", "date", "copyright", "geotag", "orientation"]
DOWNLOAD_DOMAIN = "kraken.io"  # results come from dl.kraken.io


class Kraken:
    id = "kraken"
    name = "Kraken.io"
    formats = ("png", "jpg", "webp", "avif")
    sends_offsite = True

    def ready(self) -> bool:
        return bool(settings.KRAKEN_API_KEY.strip() and settings.KRAKEN_API_SECRET.strip())

    @sensitive_variables("options", "body")
    def shrink(self, job: Job, deadline: float) -> bytes:
        options: dict = {
            "auth": {
                "api_key": settings.KRAKEN_API_KEY.strip(),
                "api_secret": settings.KRAKEN_API_SECRET.strip(),
            },
            "wait": True,
        }
        if job.quality is not None:
            options |= {"lossy": True, "quality": job.quality}
        if not job.strip_metadata:
            options["preserve_meta"] = PRESERVE
        elif not job.srgb:
            options["preserve_meta"] = ["profile"]
        body, content_type = http.multipart(
            {"data": json.dumps(options)}, "upload", f"image.{job.format}", job.mime, job.data
        )
        answer = http.send(
            "POST",
            API,
            deadline=deadline,
            max_bytes=http.JSON_MAX_BYTES,
            headers={"Content-Type": content_type},
            body=body,
        )
        data = http.json_body(answer)
        if answer.status != 200 or data.get("success") is not True:
            raise http.failure(answer, "message")
        url = data.get("kraked_url")
        if not isinstance(url, str) or not _is_download_url(url):
            raise OptimizerError("the service sent no download address")
        output = http.send("GET", url, deadline=deadline, max_bytes=settings.IMAGE_OPTIMIZER_MAX_BYTES)
        if output.status != 200:
            raise http.failure(output)
        return output.body


def _is_download_url(url: str) -> bool:
    """Whether `url` is an https address on Kraken's own domain, on the default port, with no credentials: the
    answer names the address, so it must not point the server anywhere else."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").rstrip(".").lower()
    return (
        parts.scheme == "https"
        and port in (None, 443)
        and parts.username is None
        and parts.password is None
        and (host == DOWNLOAD_DOMAIN or host.endswith("." + DOWNLOAD_DOMAIN))
    )
