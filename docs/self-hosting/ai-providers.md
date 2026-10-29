# AI image providers

Doory removes backgrounds in two ways:

1. In the browser (the default): a small model (`u2netp`, about 4.6 MB) is downloaded once and runs on the
   user's device, so the image never leaves it.
2. On a server: a model server you host, or an outside API. It handles fine detail better (hair, thin edges),
   takes the work off slow devices, and is what the MCP tools use (`list_ai_models`, `remove_asset_background`,
   `remove_background` in `edit_design`, `import_stock_photo` and `upload_image_from_url`).

## The reference server

[`deploy/ai-server`](../../deploy/ai-server) is a small server that implements Doory's contract, with models under
open licences only (Apache-2.0, MIT). Its README covers Docker, systemd, the models, limits and settings. With
Doory's compose file, add `ai` to `COMPOSE_PROFILES`, set `AI_SERVER_API_KEY`, and point provider 1 at it
(`.env.example` has the lines; every setting is in [configuration.md](configuration.md#ai-image-providers)).
Always set the key, and never publish its port beyond localhost or a private network.

## Other servers

Doory speaks five API styles, so most servers can be connected without code:

| Style | What the server does |
|---|---|
| `doory` | Doory's contract: `GET /v1/models`, `POST /v1/{task}`, answers a PNG or JSON with base64 |
| `multipart` | Takes a file upload, answers a PNG |
| `json` | Takes and answers base64 images in JSON |
| `mask` | Answers a black and white mask, which Doory applies to the image |
| `custom` | Any method, path, headers and field names |

For example, Provider X with a multipart API:

```ini
AI_PROVIDER_2_URL=https://api.provider-x.example
AI_PROVIDER_2_STYLE=multipart
AI_PROVIDER_2_STYLE_CONFIG={"path": "/v1/remove", "file_field": "image_file"}
AI_PROVIDER_2_AUTH_HEADER=X-Api-Key
AI_PROVIDER_2_AUTH_VALUE=<your key>
AI_PROVIDER_2_LABEL=Provider X
AI_PROVIDER_2_SENDS_OFFSITE=true
```

Style settings that help with hosted APIs (the admin's help lists every setting of each style):

- `send_as`: `"data-url"` sends the image as a `data:image/…;base64,…` URL instead of plain base64, for APIs
  whose image field takes a URL (`json` and `custom` styles).
- `option_fields`: renames task options or leaves them out, e.g. `{"scale": "upscale_factor"}`, or
  `{"scale": ""}` for a server that has no such option or uses the name for something else (`multipart`,
  `json`, `mask` and `custom` styles). A new name may not be one the request already uses (the image, model
  or options field, or an `extra_fields` key).

## Upscaling

The Upscale button on a picture makes it two or four times larger. By default it runs on the user's device with a
pure-code resampler: instant, with nothing downloaded and nothing sent. A provider with `upscale` in its tasks
adds an AI model as a second choice in the same dialog, which adds detail that resampling can't. "On this device"
stays the default until the user picks another option; the editor remembers the last pick.

- The request carries the option `scale` (2 or 4). Doory scales the server's result to exactly that many times
  the picture's size, so a server that always answers at a fixed size works too, as long as it keeps the shape.
- A result over the upload limits (12,000 px a side, 80 megapixels) is refused before the server is called. A
  result too large for an upload as PNG is stored as WebP; one too large even then is refused, so choose a
  smaller scale.
- Assistants use `upscale_asset` (MCP), and scripts `POST /api/v1/ai/upscale/` with
  `{"asset_id": "…", "model": "…", "options": {"scale": 2}}`. The models are listed by `list_ai_models` with
  `task="upscale"`, or `GET /api/v1/ai/models/?task=upscale`.

For example, Provider Z, a hosted upscaler with a JSON API that takes the image as a URL and answers base64:

```ini
AI_PROVIDER_3_URL=https://api.provider-z.example
AI_PROVIDER_3_STYLE=json
AI_PROVIDER_3_TASKS=upscale
AI_PROVIDER_3_STYLE_CONFIG={"path": "/v1/images/generations", "send_as": "data-url", "file_field": "image_url", "option_fields": {"scale": ""}, "extra_fields": {"response_format": "b64_json"}, "response_path": "data.0.b64_json"}
AI_PROVIDER_3_MODELS=vendor/upscaler:AI upscale
AI_PROVIDER_3_AUTH_HEADER=Authorization
AI_PROVIDER_3_AUTH_VALUE=Bearer <your key>
AI_PROVIDER_3_SENDS_OFFSITE=true
AI_PROVIDER_3_TIMEOUT_SECONDS=180
```

Check it works: in the admin under "AI providers", the provider's Test sends a small sample picture and shows the
result. Hosted upscalers can take a minute or two per picture, so raise `TIMEOUT_SECONDS` (at most 300). Behind
[`deploy/nginx.conf`](../../deploy/nginx.conf), requests to the API are cut off after 120 seconds, and users' own
servers get at most 60 seconds.

## Operator settings

Stored provider keys are encrypted with `AI_SECRETS_KEY` (or a key derived from `DJANGO_SECRET_KEY`). After
setting a new `AI_SECRETS_KEY`, keep the old one in `AI_SECRETS_KEY_FALLBACKS` and run
`manage.py reencrypt_ai_secrets` (`--dry-run` first), then drop the old key.

- Providers can also be managed in the admin under "AI providers": order, daily quota per user, timeout and
  largest image.
- With `SENDS_OFFSITE=true`, the editor and the MCP answers say that the image leaves this installation.
- Servers on private networks are reached only when listed in `AI_ALLOWED_PRIVATE_HOSTS` (or by IP address).
- `AI_USER_PROVIDERS=staff` or `everyone` lets users add their own servers in Settings → AI providers. Their
  keys are stored encrypted.

To write your own compatible server, follow the contract: `GET /api/v1/ai/contract.yaml` on your
installation, or [`backend/apps/ai/contract/openapi.yaml`](../../backend/apps/ai/contract/openapi.yaml).
