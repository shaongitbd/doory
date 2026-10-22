# Image optimization

## What it does

Makes exported images smaller after they are drawn: downloads from the editor, the image export API
(`POST /api/v1/designs/{id}/export/image/`) and the MCP tool `export_design`. People pick an optimizer from the
ones you turn on; the API and MCP choose one with the `optimize` option.

| Optimizer | Id | What it does | Leaves the server |
|-----------|----|--------------|-------------------|
| **Built-in** | `builtin` | JPG: mozjpeg's `cjpeg` encodes the page again from its lossless PNG, at the same quality (photos get about 19% smaller; above quality 90 it gains nothing and is skipped). PNG: `oxipng -o 2`, lossless (14–22% smaller). WebP and AVIF are already as small as these tools make them and stay as they are | no |
| **TinyPNG** | `tinypng` | The [Tinify API](https://tinypng.com/developers). PNGs get fewer colours (lossy); JPG, WebP and AVIF are encoded again | yes |
| **Kraken.io** | `kraken` | The [Kraken.io API](https://kraken.io/docs). JPG, WebP and AVIF are lossy at the export's quality; PNGs stay lossless | yes |
| **Custom** | `custom` | Any other optimizer, hosted or your own, that follows the [contract below](#custom-optimizer-contract). You choose the name people see | depends on where it runs |

Every optimizer is **fail-safe**: a file is never made bigger, and when an optimizer fails, times out or sends
back something that isn't the same image, the export carries on with the unoptimized file and a warning.

The editor draws downloads in the browser, then sends the page as a PNG to `POST /api/v1/exports/optimize/`,
which converts it (also to AVIF, which browsers can't make, and to WebP where the browser can't) and optimizes
it. If the server can't be reached, the browser's own file is downloaded.

## Requirements

- **Built-in:** the `cjpeg` program of [mozjpeg](https://github.com/mozilla/mozjpeg) and
  [oxipng](https://github.com/oxipng/oxipng) on the `PATH` of the API and MCP services.
  - **Docker:** `INSTALL_IMAGE_OPTIMIZERS=true` (the default) builds mozjpeg 4.1.5 from source and installs the
    official oxipng 10.2.1 release, checked against its SHA-256. Together they add about 2 MB.
  - **Without Docker:** install both, for example from your distribution or the projects' releases. Only
    mozjpeg's `cjpeg` counts: the one from libjpeg-turbo makes no smaller files and is ignored.
  - With only one of them, only its format is optimized.
- **TinyPNG:** an API key from your TinyPNG account. Each image counts as one compression.
- **Kraken.io:** an API key and secret from your Kraken.io account.
- **Custom:** the address of a server that follows the contract.

TinyPNG and Kraken.io receive every image people optimize with them. Tell your users if that matters to them;
the editor marks optimizers that send images off the server.

## Turn it on

The built-in optimizer is on by default wherever its programs are installed. To offer more, list them in the
order people should see them, and set their keys:

```ini
IMAGE_OPTIMIZERS=builtin,tinypng,kraken,custom
IMAGE_OPTIMIZER_DEFAULT=builtin
TINYPNG_API_KEY=...
KRAKEN_API_KEY=...
KRAKEN_API_SECRET=...
IMAGE_OPTIMIZER_CUSTOM_NAME=Our optimizer
IMAGE_OPTIMIZER_CUSTOM_URL=https://optimizer.example.com/v1/optimize
IMAGE_OPTIMIZER_CUSTOM_KEY=...
```

An optimizer that is listed but not set up (no key, no programs) isn't offered. `IMAGE_OPTIMIZERS=` (empty)
turns optimizing off; conversion for downloads keeps working. `optimize: true` uses
`IMAGE_OPTIMIZER_DEFAULT`, never another optimizer in its place.

Calls to TinyPNG, Kraken.io and the custom optimizer use the same network rules as the
[AI providers](../self-hosting/ai-providers.md): redirects are not followed, there is one time limit per file,
and nothing about the request is logged. A custom optimizer on your private network needs its host name in
`AI_ALLOWED_PRIVATE_HOSTS`, or an IP address in its URL.

### Custom optimizer contract

```text
POST {IMAGE_OPTIMIZER_CUSTOM_URL}?format=keep&quality=1-100&metadata=none|icc|all
Content-Type: image/png | image/jpeg | image/webp | image/avif
Authorization: Bearer {IMAGE_OPTIMIZER_CUSTOM_KEY}      (only when a key is set)

<the image bytes, not multipart>
```

- **Answer:** `200` with the image bytes and the headers `Content-Type`, `X-Format` (`png`, `jpeg`, `webp`,
  `avif`), `X-Width`, `X-Height` and `X-Output-Size`. It must be the same format and size as what was sent, and
  never larger (send the input back instead).
- **Errors:** `4xx` or `5xx` with a JSON body `{"error": "...", "message": "..."}`. The message is shown to the
  person exporting, so keep secrets out of it.
- **Parameters:** `quality` is sent for JPG, WebP and AVIF. `metadata` is `none` (remove everything), `icc`
  (keep the colour profile only) or `all`. The contract also defines `format=best|best-web|webp|avif|jpeg|png`,
  `resize=WxH` and `fit=inside|cover|fill` for other clients; Doory always sends `format=keep` and the final
  size.

### Downloads from the editor

`POST /api/v1/exports/optimize/` (signed in; multipart) takes the page as a PNG in `file`, and the fields
`format` (`png`, `jpg`, `webp`, `avif`, `auto`), `quality`, `max_bytes`, `png_colors`, `transparent`,
`strip_metadata`, `srgb`, `progressive` (as in the [image export options](../self-hosting/image-export.md#image-options))
and `optimize` (`true`, the default; `false`; or an optimizer's id). It answers with the file and these headers:

| Header | What it says |
|--------|--------------|
| `X-Doory-Format`, `X-Doory-Width`, `X-Doory-Height` | The file's format and size |
| `X-Doory-Quality` | JPG, WebP and AVIF: the quality used, after a `max_bytes` search |
| `X-Doory-Bytes-Before` | The file's size before optimizing |
| `X-Doory-Optimizer` | The optimizer asked, empty for none |
| `X-Doory-Optimized` | `true` when its smaller file was kept |
| `X-Doory-Warnings` | A JSON list of notes, for example why the file isn't optimized |

The file may be at most `IMAGE_OPTIMIZER_MAX_BYTES` and `EXPORT_IMAGE_MAX_PIXELS`. Each call counts against the
`optimize` rate (60 a minute per user) and holds one of the `EXPORT_MAX_CONCURRENCY` export slots while it runs.
`GET /api/v1/config/` lists the formats and the optimizers people may pick under `features.image_optimize`.

## Settings

See [Image optimization in configuration.md](../self-hosting/configuration.md#image-optimization).

## Check it works

- `docker compose exec api python manage.py check` reports optimizers that are listed but not set up, and a
  custom optimizer key that would be sent over plain `http://`.
- `curl -s https://doory.example.com/api/v1/config/ | jq .features.image_optimize` lists the optimizers on offer.
- With [server-side image export](../self-hosting/image-export.md) on, export a page with
  `{"format": "jpg", "quality": 82, "optimize": true}`. Over MCP, the result reports `optimizer` and
  `bytes_before_optimizing`.

## Troubleshooting

- **The built-in optimizer is missing:** `manage.py check` says which program it can't find. In Docker, rebuild
  with `INSTALL_IMAGE_OPTIMIZERS=true`.
- **A JPG isn't smaller:** at quality above 90, or with `strip_metadata` or `srgb` off, the built-in optimizer
  keeps Pillow's file. For flat graphics, mozjpeg's file at the same quality can be bigger, and is then not
  used.
- **"could not optimize the file" warnings:** the message says what the service answered. Check the key, your
  plan's limits, and `IMAGE_OPTIMIZER_TIMEOUT`.
- **The custom optimizer is "refused":** its address is on a private network; add its host name to
  `AI_ALLOWED_PRIVATE_HOSTS`.
