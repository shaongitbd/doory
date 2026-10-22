# Server-side export

Most downloads (PNG, JPG, SVG, PDF, MP4, WebM, GIF) are made in the user's browser and don't need the server.
These exports run on the server, in a headless Chromium:

| Export | Used for | Setting | Default |
|--------|----------|---------|---------|
| Print PDF | Print-quality PDFs | `SERVER_PDF_ENABLED` | on |
| Saved designs as images (PNG, JPG, WebP, AVIF), SVG or PDF; several image or SVG pages as a ZIP | `POST /api/v1/designs/{id}/export/image/` and the MCP tool `export_design` | `SERVER_IMAGE_EXPORT_ENABLED` (PDFs also `SERVER_PDF_ENABLED`) | off |
| Saved designs as video (MP4, WebM, GIF) | The same endpoint and tool | `SERVER_VIDEO_EXPORT_ENABLED` and `SERVER_IMAGE_EXPORT_ENABLED` | off |

## Requirements

- **Docker:** `INSTALL_CHROMIUM=true` (the default) builds Chromium into the `api` and `mcp` images, which adds
  about 400 MB.
- **Without Docker:** install Playwright's Chromium (see [manual.md](manual.md#optional-server-side-export)), or
  point `EXPORT_CHROMIUM_PATH` at another Chromium.
- **Image export also needs the built frontend's `render.html`** at an address the API (and MCP) service can
  reach. In Docker the default `EXPORT_RENDER_PAGE_URL=http://doory-web:8080/render.html` already works. Without
  Docker the default is `SITE_URL/render.html`, served by nginx from `frontend/dist`. The Vite dev server won't
  work for this.
- **AVIF needs Pillow 11.2 or newer built with libavif.** The Pillow wheels that `pip install` gets (and the
  Docker image) include it. Without it, AVIF is refused and `auto` compares the other formats.

## Turn it on

```ini
SERVER_IMAGE_EXPORT_ENABLED=true
```

Turning it on runs the editor's drawing code (JavaScript) inside the export browser. The browser can only load
the render page, `/assets/`, and `/media/` and `/static/` from `EXPORT_ALLOWED_ORIGINS`; every other request is
blocked.

To use Docker without Chromium, set `INSTALL_CHROMIUM=false` and `SERVER_PDF_ENABLED=false`, and leave image
export off.

## Image options

The REST endpoint (a JSON body) and the MCP tool `export_design` take the same options:

| Option | Default | What it does |
|--------|---------|--------------|
| `page` | first page | One page, by its id or its number counting from 1 |
| `pages` | | Several pages instead: `"all"` or a list such as `[1, 3]`. They come back as one ZIP |
| `format` | `png` | `png`, `jpg`, `webp`, `avif`, or `auto`: all of them, keeping the smallest file (no JPG when `transparent`, and no AVIF for images of more than 8 million pixels, which are slow to make in AVIF). Also `svg`, `pdf` and `pdf-print`: see [SVG and PDF](#svg-and-pdf); and `mp4`, `webm` and `gif`: see [Video](#video) |
| `quality` | `90` | JPG, WebP and AVIF: 1 to 100, or `small` (65), `balanced` (82), `best` (95), `original` (100) |
| `max_bytes` | | Largest file wanted. JPG, WebP and AVIF use the highest quality, up to `quality`, that fits. If even the lowest doesn't fit, the smallest file comes back with a warning |
| `scale` | `1` | Output pixels per page pixel, from 0.1 to 4 |
| `size` | | Instead of `scale`: `"2x"`, `"1080w"` (that many pixels wide) or `"1350h"` (that many pixels high) |
| `transparent` | `false` | Leave the page background out (not for JPG) |
| `png_colors` | `full` | PNG only: a palette of 2 to 256 colours, used only when the file gets smaller |
| `strip_metadata` | `true` | Leave text, time and Exif metadata out |
| `srgb` | `true` | Leave any colour profile out (the page is drawn in sRGB) |
| `progressive` | `false` | JPG only: a progressive JPG |
| `optimize` | `false` | Make the file smaller afterwards: `true` (the default optimizer) or an optimizer's id. It never makes a file bigger; see [image optimization](../integrations/image-optimization.md) |
| `file_names` | `EXPORT_FILENAME_STYLE` | `simple` or `detailed` (with platform, preset and size) names. The REST endpoint also takes `filename_style` and `filename_timestamp` |
| `bleed_mm` | `0` | PDF only: bleed around every page, 0 to 10 mm (3 is usual for print) |
| `crop_marks` | `false` | PDF only: crop marks in a margin around the bleed |
| `cmyk` | `false` | Not offered: PDFs are RGB, as on screen, and `true` is refused (`cmyk_unavailable`) |
| `resolution`, `fps`, `fit`, `sound`, `loop`, `dither`, `page_seconds` | | Video only: see [Video](#video) |

Each page is drawn on its own, one after another, so a ZIP of many pages takes as long as that many exports.
The whole export, drawing, converting and optimizing every page, must be done within
`EXPORT_IMAGE_TIMEOUT_SECONDS` (100 s): each page's render gets at most `EXPORT_TIMEOUT_SECONDS` (30 s) of what
is left, a `max_bytes` search and `auto` keep the best file made by then, an optimizer that runs out of time
leaves its file unoptimized, and a page that can't start in time stops the export with `export_timeout` (504).
The options are checked for every page before anything is drawn. Each page after the first counts once more
against the `export` rate (30 a minute per user), and over MCP against `MCP_CALLS_PER_MINUTE` too. With an
optimizer that sends the image off the server (TinyPNG, Kraken.io or the custom one), every page also counts
against the `optimize_offsite` rate (10 a minute per user). `EXPORT_IMAGE_MAX_PAGES` limits the pages one
export may draw. Over MCP, AVIF images, SVG files, PDFs and ZIPs are always sent as a download link, because
clients can't show them inline.

## SVG and PDF

These formats make the same files as the editor's Download:

| `format` | File | How it is made |
|----------|------|----------------|
| `svg` | One SVG per page (several pages as a ZIP), with its pictures and fonts inside | Drawn by the render page |
| `pdf` | One PDF of all pages, each a 300 dpi picture | Pictures from the render page, printed as a PDF |
| `pdf-print` | One vector PDF for printing: text stays text, fonts are embedded, links work | Pages from the render page, through the print PDF pipeline |

All pages are made in one browser, within `EXPORT_TIMEOUT_SECONDS` for each page. A PDF is then printed within
another `EXPORT_TIMEOUT_SECONDS`. Both PDFs take `bleed_mm` and `crop_marks`, and their pages get TrimBox and
BleedBox entries like the print PDF. A `pdf` page whose picture would have more than `EXPORT_IMAGE_MAX_PIXELS`
pixels at 300 dpi is drawn at a lower resolution, with a warning. The image options (from `quality` to
`optimize`) don't apply to these formats. Each page after the first counts once more against the rates, as for
images. There is no CMYK conversion.

## Video

`mp4`, `webm` and `gif` make the same files as the editor's video download: the pages one after another, with
their animations and transitions, each held for its own time (5 s when it has none). The render page runs the
editor's video pipeline in the export browser. Turn it on with both switches:

```ini
SERVER_IMAGE_EXPORT_ENABLED=true
SERVER_VIDEO_EXPORT_ENABLED=true
```

| Option | Default | What it does |
|--------|---------|--------------|
| `pages` | all pages | As for images; `page` makes a video of one page |
| `resolution` | MP4, WebM: `design`; GIF: `480` | The shorter side of the frame in px: MP4 and WebM `design` (the first page's size, at most 1920 px on its longer side), 480, 720, 1080 or 2160; GIF 240, 360, 480 or 720. `EXPORT_VIDEO_MAX_RESOLUTION` caps it |
| `fps` | MP4, WebM: `30`; GIF: `15` | MP4 and WebM 24, 30 or 60; GIF 5, 10, 15 or 20 |
| `quality` | `balanced` | `small`, `balanced` or `best`. A number counts as `small` up to 70, `balanced` up to 90, `best` above |
| `fit` | `fit` | A page of another shape than the first: shown whole with bars (`fit`), or covering the frame (`fill`) |
| `sound` | `true` | MP4 and WebM: the design's sound |
| `loop` | `0` | GIF: how often it plays, `0` for ever |
| `dither` | `true` | GIF: smoother gradients, larger file |
| `page_seconds` | | Hold every page this long (1 to 600 s) instead of its own time |

- **Codecs:** MP4 is H.264 and WebM is VP9, both with Opus sound. The Chromium that Playwright installs has no AAC
  encoder, so an MP4's sound is Opus too, with a warning in the answer: browsers, VLC and Android play it, but
  some older Apple apps play such an MP4 without sound. Chromium's encoders run in software; no GPU is needed.
- **Limits:** a video is made within `EXPORT_VIDEO_TIMEOUT_SECONDS` (300 s), at most `EXPORT_VIDEO_MAX_SECONDS`
  long (120 s) and `EXPORT_VIDEO_MAX_BYTES` large (200 MB). A longer video is refused (`too_long`) before it is
  drawn, a larger file after (`too_large`). One video holds one of the `EXPORT_MAX_CONCURRENCY` export slots
  for its whole time.
- **Rates:** each started 10 s of the pages' time after the first counts once more against the `export` rate,
  and over MCP against `MCP_CALLS_PER_MINUTE`.
- **Delivery:** the REST endpoint answers with the file, streamed from a temporary file in `EXPORT_WORK_DIR`
  (the system temp folder by default) rather than held in memory. Leave room there for two copies of
  `EXPORT_VIDEO_MAX_BYTES` for each video being made. Over MCP, a video is always a download link.
- **Proxy:** the request stays open while the video is made. The bundled nginx waits 330 s for this endpoint and
  for `/mcp`; a proxy of your own needs at least `EXPORT_VIDEO_TIMEOUT_SECONDS` there too.
- **Secure page:** the browser's video encoders only work on a secure page. When `EXPORT_RENDER_PAGE_URL` is a
  plain `http://` address (as in Docker), the export browser opens it as `http://<host>.localhost:<port>` and
  fetches it from the real address. Nothing to set up.

## Settings

See [Server-side export in configuration.md](configuration.md#server-side-export): size limits, concurrency,
timeouts, work folders and file names.

## Housekeeping

Exported images waiting to be downloaded are kept in `EXPORT_STORAGE_ROOT` until their link expires. Expired
images are deleted each time a new one is stored. On a quiet site, `manage.py purge_exports` deletes them too
(see [Scheduled tasks](README.md#scheduled-tasks)).

## Check it works

- Export a design as a print PDF from the editor's Share menu.
- With image export on, sign in and call `POST /api/v1/designs/{id}/export/image/` for one of your designs, for
  example with `{"format": "auto", "size": "1080w", "max_bytes": 500000}`, `{"pages": "all"}` for a ZIP, or
  `{"format": "pdf-print", "pages": "all", "bleed_mm": 3, "crop_marks": true}`.
- With video export on, `{"format": "mp4", "resolution": 720}` makes a video of all pages.

## Troubleshooting

- **Chromium crashes in Docker:** the services set `shm_size: 512m`; keep it. For the `mcp` service, raise
  `MCP_MEM_LIMIT` if it runs out of memory.
- **Exports time out:** raise `EXPORT_TIMEOUT_SECONDS`, or lower `EXPORT_MAX_CONCURRENCY` on small servers.
  Exports of several pages run in one request and stop after `EXPORT_IMAGE_TIMEOUT_SECONDS`: export fewer pages
  at once, or a smaller size. Keep `EXPORT_IMAGE_TIMEOUT_SECONDS` under the web server's worker timeout (120 s
  in the Docker image).
- **Image export returns blank pages or 404s:** `EXPORT_RENDER_PAGE_URL` must point to the *built* frontend, at an
  address the API container can reach.
- **SVG and PDF fail with 503 while images work:** the frontend is older than the API; deploy both from the same
  version.
- **A video fails with 503 (`export_unavailable`):** the export browser has no encoder for the format, or the
  frontend is older than the API. Deploy both from the same version and keep Playwright's Chromium.
- **A video fails with `sound_unavailable`:** a sound file of the design could not be loaded (missing, or larger
  than 30 MB). The error names it.
- **Video exports end with 504 at the proxy:** raise the proxy's read timeout for
  `/api/v1/designs/*/export/image/` and `/mcp` to at least `EXPORT_VIDEO_TIMEOUT_SECONDS`.
- **An SVG export fails with `image_unavailable`:** a picture of the design could not be fetched to put into the
  file. Check that it is under `/media/` on an allowed origin.
- **macOS development, "socket path too long":** set `EXPORT_WORK_DIR` to a short path such as `/tmp/dxw`.
