# Reference AI server

A small background removal server you can host yourself. It implements Doory's contract
(`backend/apps/ai/contract/openapi.yaml`, also served at `/api/v1/ai/contract.yaml`), so Doory reaches it with
the `doory` API style.

- Routes: `GET /v1/models`, `POST /v1/background-removal`, `GET /health`
- Answer: a transparent PNG, or JSON with `image_b64` when the request asks for JSON only
- Models: open licences only (Apache-2.0, MIT), run on the CPU through ONNX Runtime (via rembg)
- Doory calls it from its backend. It has no CORS, and every route except `/health` needs the key. It doesn't
  start without `API_KEY` unless `ALLOW_NO_KEY=true` is set.

## Models

| Model | Licence | File | Memory | Time per image (CPU) | Notes |
|---|---|---|---|---|---|
| `isnet-general-use` (default) | Apache-2.0 | about 179 MB | about 1.4 GB | about 1.2–1.5 s | Clean edges on hair and thin details |
| `u2net` | Apache-2.0 | about 176 MB | about 1.3 GB | about 1 s | Good on large, simple subjects |
| `u2netp` | Apache-2.0 | about 4.7 MB | about 200 MB | about 0.7 s | Small and fast; the same model as Doory's in-browser removal |
| `birefnet-general-lite` | MIT | about 224 MB | about 6–8 GB | about 6 s | Fine edges; only on hosts with plenty of memory |

Only the models in `AVAILABLE_MODELS` are offered and accepted; any other `model` is refused. A loaded model
stays in memory, so offer only what the host can hold at once.

### Where the models come from

rembg downloads each file from its GitHub release `v0.0.0` (`github.com/danielgatis/rembg/releases/tag/v0.0.0`)
and checks it against the checksum it ships with. The Docker image does this at build time for the models in
the `MODELS` build argument, so the running container needs no outbound network. Without Docker, download
them once before starting (below).

## Docker

### With Doory's compose file

Add to `.env`:

```bash
COMPOSE_PROFILES=ai                  # or mcp,ai
AI_SERVER_API_KEY=<a long random key>
AI_PROVIDERS_ENABLED=true
AI_PROVIDER_1_URL=http://ai-server:7000
AI_PROVIDER_1_STYLE=doory
AI_PROVIDER_1_AUTH_HEADER=Authorization
AI_PROVIDER_1_AUTH_VALUE=Bearer <the same key>
AI_PROVIDER_1_LABEL=High quality (server)
AI_ALLOWED_PRIVATE_HOSTS=ai-server
```

Then `docker compose up -d --build`. The service runs on the internal network only, with a memory limit, a
read-only file system, no capabilities and `no-new-privileges`. `AI_SERVER_MODELS` picks the models baked into
the image (rebuild after changing it); `.env.example` lists the other settings.

### On its own

```bash
docker build -t doory-ai-server --build-arg MODELS=isnet-general-use,u2netp deploy/ai-server
docker run -d --name doory-ai-server -p 127.0.0.1:7000:7000 -e API_KEY=<a long random key> \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true --memory 2g doory-ai-server
```

Publish the port on `127.0.0.1` (or a private network) only, and always set `API_KEY`: the server is
CPU-heavy, and without a key anyone who reaches it can use it.

## Without Docker (systemd)

```bash
cd /opt/doory/deploy/ai-server
sudo -u doory python3.12 -m venv .venv && sudo -u doory .venv/bin/pip install -r requirements.txt
sudo install -d -o doory -g doory /var/lib/doory/models
sudo -u doory U2NET_HOME=/var/lib/doory/models .venv/bin/python -c \
  "from rembg import new_session; [new_session(m) for m in ('isnet-general-use', 'u2netp')]"
sudo install -d -m 755 /etc/doory
echo "API_KEY=<a long random key>" | sudo install -m 600 /dev/stdin /etc/doory/ai-server.env
sudo cp ../doory-ai-server.service /etc/systemd/system/ && sudo systemctl enable --now doory-ai-server
```

The unit listens on `127.0.0.1:7000`. In Doory's `.env`, set `AI_PROVIDER_1_URL=http://127.0.0.1:7000` and the
same key, as above.

## Trying it

```bash
curl http://127.0.0.1:7000/health
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:7000/v1/models
curl -H "Authorization: Bearer $KEY" -F image=@photo.jpg -o cutout.png http://127.0.0.1:7000/v1/background-removal
curl -H "Authorization: Bearer $KEY" -F image=@photo.jpg -F model=u2netp -o cutout.png \
  http://127.0.0.1:7000/v1/background-removal
```

## Limits and errors

- The request body is limited to `MAX_IMAGE_BYTES` before it is read, and the image to PNG, JPEG or WebP with
  at most 12,000 pixels a side and 80 million pixels, the same as Doory. Both are checked before decoding.
- `WORKERS` images are processed at once. More requests get `429` with `Retry-After`, which Doory reports
  as busy. An image that takes longer than `TIMEOUT_SECONDS` gets `503`.
- Errors are JSON (`{"error": {"code": …, "message": …}}`) with fixed messages; details go to the server log only.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `API_KEY` | empty | The key; requests send `Authorization: Bearer <key>` or `X-Api-Key: <key>`. The server doesn't start without it |
| `ALLOW_NO_KEY` | `false` | Start without a key anyway: only for a server nobody else can reach |
| `AVAILABLE_MODELS` | `isnet-general-use,u2netp` | The models offered and accepted |
| `DEFAULT_MODEL` | the first available | Used when a request names no model; ignored when it isn't available |
| `PORT` | `7000` | Port (Docker image) |
| `WORKERS` | `1` | Images processed at once |
| `TIMEOUT_SECONDS` | `60` | Longest time for one image |
| `MAX_IMAGE_BYTES` | `26214400` (25 MB) | Largest upload |
| `OMP_NUM_THREADS` | `4` | CPU threads per image |
| `U2NET_HOME` | `/models` | Folder of the model files |
| `PRELOAD_MODELS` | empty | Models loaded into memory at start instead of on first use |
| `LOG_LEVEL` | `INFO` | Log level |

## Tests

```bash
cd deploy/ai-server
pip install -r requirements.txt pytest httpx
python -m pytest tests
```
