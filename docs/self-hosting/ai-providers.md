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

Doory speaks six API styles, so most servers can be connected without code:

| Style | What the server does |
|---|---|
| `doory` | Doory's contract: `GET /v1/models`, `POST /v1/{task}`, answers a PNG or JSON with base64 |
| `multipart` | Takes a file upload, answers a PNG |
| `json` | Takes and answers base64 images in JSON |
| `mask` | Answers a black and white mask, which Doory applies to the image |
| `custom` | Any method, path, headers and field names |
| `queue` | Text to image: takes a prompt as a job, answers with its status, then a link to the picture |

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

## Text to image

The `text-to-image` task makes a new picture from a typed prompt (at most 2,000 characters). It is off until an
admin sets up a provider for it; the editor then shows a Create tab in the image drawer, and the picture is
added to the user's images. It needs a server with the `queue` style, the only style that sends a prompt:

| Step | Request | Answer |
|---|---|---|
| Submit | `POST {URL}{path}`, JSON `{"prompt": …}` plus `extra_fields` | `request_id`, and optionally `status_url` and `response_url` |
| Status | `GET status_url` (else `status_path`) | `status`: `IN_QUEUE`, `IN_PROGRESS` or `COMPLETED`; `error` when the job failed |
| Result | `GET response_url` (else `result_path`) | the picture's link at `response_path` (default `images.0.url`) |

The job's own links are used only when they are on the provider's server. The submit carries an
`Idempotency-Key`, so a retry after a dropped connection never starts a second job. The picture is downloaded
from its link without the provider's key, and never from an IP address on a private network. The whole job
shares `TIMEOUT_SECONDS`, and the same prompt with the same model returns the cached picture for
`AI_CACHE_SECONDS`.

For example, [MiniAPI](https://api.minicut.ai/models?utm_source=shaongitbd-doory&utm_medium=repo-pr) speaks this
protocol. GPT Image 2 there costs from $0.0055 an image, and a failed job is not charged:

```ini
AI_PROVIDER_3_URL=https://api.minicut.ai
AI_PROVIDER_3_STYLE=queue
AI_PROVIDER_3_STYLE_CONFIG={"extra_fields": {"image_size": "landscape_4_3", "quality": "medium"}}
AI_PROVIDER_3_TASKS=text-to-image
AI_PROVIDER_3_MODELS=gpt-image-2:GPT Image 2
AI_PROVIDER_3_AUTH_HEADER=Authorization
AI_PROVIDER_3_AUTH_VALUE=Key <your key>
AI_PROVIDER_3_LABEL=MiniAPI
AI_PROVIDER_3_TIMEOUT_SECONDS=90
AI_PROVIDER_3_SENDS_OFFSITE=true
```

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
