# Configuration

Doory reads its settings from environment variables. The sections below appear in the same order as the
root [`.env.example`](../../.env.example).

- **Docker:** copy `.env.example` to `.env` next to `docker-compose.yml`. Compose passes it to every service.
- **Without Docker:** put the settings in `backend/.env`, which the API, realtime and MCP services all read.
- **Local development:** `backend/.env` too (start from [`backend/.env.example`](../../backend/.env.example)).

A blank **Default** means the setting is empty or off. After changing a setting, restart the services
(`docker compose up -d`, or `systemctl restart doory-api doory-realtime doory-mcp`).

Every setting in the settings files and `.env.example` is listed here; `make docs-check` fails when one is missing. To add a setting,
add a row to the matching section (see [CONTRIBUTING.md](../../CONTRIBUTING.md#documentation)).

## Required

| Setting | Default | What it does |
|---------|---------|--------------|
| `SITE_URL` | `http://localhost:5173` | Public address of the site, with the scheme and without a trailing slash. Used in emails, CSRF checks and export URLs |
| `DJANGO_SECRET_KEY` | | A long random value (`openssl rand -base64 48`). Production refuses the development key and keys shorter than 32 characters. Changing it signs everyone out and revokes MCP tokens, unless the old key goes in `DJANGO_SECRET_KEY_FALLBACKS` |
| `DJANGO_SECRET_KEY_FALLBACKS` | | Old secret keys, comma separated, so you can rotate the key without signing everyone out |
| `POSTGRES_PASSWORD` | | Docker: the database password. Use letters and digits only, because it goes into `DATABASE_URL` |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names the site answers to, comma separated. A leading dot also matches subdomains |

## HTTPS and proxies

| Setting | Default | What it does |
|---------|---------|--------------|
| `SECURE_SSL_REDIRECT` | `true` in production | Redirect `http://` to `https://`. Set to `false` while you test over plain http |
| `SECURE_COOKIES` | `true` in production | Send session and CSRF cookies over HTTPS only |
| `NUM_PROXIES` | `1` | Number of reverse proxies in front of the API, used by rate limiting. Keep `1`: the bundled nginx passes the real client address on itself. A TLS proxy with a public address needs `set_real_ip_from` in nginx instead (see [troubleshooting](troubleshooting.md)) |
| `CSRF_TRUSTED_ORIGINS` | `SITE_URL` | Origins allowed to send forms, comma separated. Without Docker only: under Docker, compose sets it from `SITE_URL`, so a value in `.env` has no effect |
| `CORS_ALLOWED_ORIGINS` | none in production | Origins on other domains that may call the API from a browser |

## Ports and build options (Docker)

| Setting | Default | What it does |
|---------|---------|--------------|
| `WEB_PORT` | `8080` | Port the site is published on |
| `WEB_BIND` | `0.0.0.0` | Interface the port is published on. Use `127.0.0.1` when a reverse proxy on the same host sits in front |
| `INSTALL_CHROMIUM` | `true` | Build a headless Chromium into the image, needed for [server-side export](image-export.md) (adds about 400 MB) |
| `INSTALL_FFMPEG` | `true` | Build ffmpeg into the image, needed for [video clips](video.md) (adds about 250 MB) |
| `INSTALL_IMAGE_OPTIMIZERS` | `true` | Build mozjpeg and oxipng into the image for the built-in [image optimizer](../integrations/image-optimization.md) (adds about 2 MB) |
| `COMPOSE_PROFILES` | | Optional services to start: `mcp`, `redis`, or both (`mcp,redis`) |
| `REALTIME_WORKERS` | `1` | Workers of the `realtime` service. Use more than 1 only together with Redis |
| `REALTIME_MEM_LIMIT` | `2g` | Memory limit of the `realtime` service |
| `MCP_WORKERS` | `1` | Workers of the `mcp` service |
| `MCP_MEM_LIMIT` | `1g` | Memory limit of the `mcp` service. `export_design` runs Chromium inside it |
| `WEB_CONCURRENCY` | `3` | Workers of the `api` service (gunicorn) |

## Database, cache and logs

| Setting | Default | What it does |
|---------|---------|--------------|
| `DATABASE_URL` | `sqlite:///backend/db.sqlite3` | Database, e.g. `postgres://doory:PASSWORD@127.0.0.1:5432/doory`. Docker builds it from the `POSTGRES_*` settings |
| `POSTGRES_DB` | `doory` | Docker: the database name |
| `POSTGRES_USER` | `doory` | Docker: the database user |
| `TEST_DATABASE_URL` | | Tests only: the database the test suite uses |
| `CACHE_URL` | `locmemcache://` | Shared cache. Production needs a cache that all workers share; Docker and the manual guide use `dbcache://doory_cache` |
| `REDIS_URL` | | Redis, e.g. `redis://redis:6379/0`. Needed only to run [realtime](realtime.md) on more than one worker |
| `LOG_LEVEL` | `INFO` | Log level of every service |
| `DJANGO_SETTINGS_MODULE` | `doory.settings.dev` | `doory.settings.prod` in production. Docker and the systemd units set it for you |
| `DJANGO_DEBUG` | `false` | Development only: show Django's debug pages |

## Media storage and per-user limits

| Setting | Default | What it does |
|---------|---------|--------------|
| `MEDIA_ROOT` | `backend/media` | Folder for uploads, fonts, element packs, audio and models. Docker uses the `media` volume |
| `USE_S3` | `false` | Store media in [S3-compatible storage](../integrations/object-storage.md) instead of `MEDIA_ROOT` |
| `AWS_STORAGE_BUCKET_NAME` | | Bucket name |
| `AWS_S3_ENDPOINT_URL` | | Endpoint, for providers other than the default one |
| `AWS_S3_REGION_NAME` | | Region |
| `AWS_ACCESS_KEY_ID` | | Access key |
| `AWS_SECRET_ACCESS_KEY` | | Secret key |
| `USER_STORAGE_QUOTA_BYTES` | `2147483648` (2 GB) | Upload space per user |
| `MAX_DESIGNS_PER_USER` | `5000` | Designs per user |
| `MAX_API_TOKENS_PER_USER` | `20` | MCP tokens per user |

## First-run content

See [content.md](content.md) for what each option installs and how long it takes.

| Setting | Default | What it does |
|---------|---------|--------------|
| `DOORY_SYNC_ELEMENTS` | `false` | Install the element library (shapes, icons, emoji, illustrations) every time the API starts |
| `DOORY_SYNC_ELEMENTS_ARGS` | | Extra arguments for `sync_element_packs`, e.g. `--pack lucide` |
| `DOORY_ELEMENTS_BRAND_LOGOS` | `false` | Include brand logos from the icon sets. These are trademarks, so they are off by default |
| `DOORY_SYNC_FONTS` | `false` | Download the font catalogue once, on the first start |
| `DOORY_SYNC_FONTS_ARGS` | `--popular 100` | Which font families to download, e.g. `--popular 253` or `--all` |
| `DOORY_SEED_TEMPLATES` | `false` | Add the starter templates every time the API starts. It only adds: templates that already exist are never changed |
| `DOORY_SYNC_MODELS` | `false` | Install the background-removal model every time the API starts |
| `DOORY_SYNC_MODELS_ARGS` | | Extra arguments for `sync_models`, e.g. `--model u2net` or `--all` |
| `DOORY_SYNC_AUDIO` | `false` | Install the music and sound-effect library every time the API starts |
| `DOORY_SYNC_AUDIO_ARGS` | | Extra arguments for `sync_audio`, e.g. `--pack some-pack` |
| `BACKGROUND_REMOVAL_ENABLED` | `true` | Offer background removal (it runs in the browser and uses the installed model) |
| `BACKGROUND_REMOVAL_MODEL` | | Which installed model to use. Empty: the best one installed |

## Server-side export

See [image-export.md](image-export.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `SERVER_PDF_ENABLED` | `true` | Make print PDFs on the server. Needs Chromium; set to `false` if you don't have it |
| `SERVER_IMAGE_EXPORT_ENABLED` | `false` | Make PNG, JPG, WebP and AVIF images, SVG files and PDFs of saved designs on the server (used by the REST API and the MCP tool `export_design`; the PDFs also need `SERVER_PDF_ENABLED`) |
| `EXPORT_RENDER_PAGE_URL` | `SITE_URL/render.html` | The built frontend's `render.html`, at an address the API and MCP services can reach. Docker: `http://doory-web:8080/render.html` |
| `EXPORT_IMAGE_MAX_PIXELS` | `40000000` | Largest image, as width × height after scaling |
| `EXPORT_IMAGE_MAX_DOCUMENT_BYTES` | `5242880` | Largest design document the export will draw |
| `EXPORT_IMAGE_MAX_PAGES` | `10` | Most pages one image, SVG or PDF export draws (several images or SVGs come back as a ZIP). Each image page is a render of its own in the same request |
| `SERVER_VIDEO_EXPORT_ENABLED` | `false` | Make MP4, WebM and GIF videos of saved designs on the server (REST API and `export_design`). Also needs `SERVER_IMAGE_EXPORT_ENABLED`. One video keeps a browser busy for up to `EXPORT_VIDEO_TIMEOUT_SECONDS` |
| `EXPORT_VIDEO_TIMEOUT_SECONDS` | `300` | Time limit for making one video. Keep your proxy's read timeout for the export endpoint and `/mcp` above it (the bundled nginx waits 330 s) |
| `EXPORT_VIDEO_MAX_SECONDS` | `120` | Longest video or GIF the server makes |
| `EXPORT_VIDEO_MAX_RESOLUTION` | `1080` | Largest shorter side of a video frame, in px (the editor offers up to 2160) |
| `EXPORT_VIDEO_MAX_BYTES` | `209715200` | Largest video file the server keeps (200 MB) |
| `EXPORT_MAX_CONCURRENCY` | `2` | Exports running at the same time in each API process |
| `EXPORT_TIMEOUT_SECONDS` | `30` | Time limit for one export. SVG and PDF exports of a saved design get it once per page to draw them, and a PDF once more to print |
| `EXPORT_CHROMIUM_PATH` | | Path to a Chromium binary. Empty: the one Playwright installed |
| `EXPORT_CHROMIUM_NO_SANDBOX` | `false` | Run Chromium without its sandbox. The Docker image sets this |
| `EXPORT_WORK_DIR` | system temp folder | Where each export gets its own temporary folder |
| `EXPORT_STORAGE_ROOT` | `backend/exports` | Where exported files wait to be downloaded. Docker uses the `exports` volume |
| `EXPORT_ALLOWED_ORIGINS` | `SITE_URL`, `http://127.0.0.1:8000` and `http://localhost:8000` | Origins Chromium may load `/media/` and `/static/` files from during an export |
| `EXPORT_FILENAME_STYLE` | `simple` | Default file names: `simple` (`summer-sale-02.png`) or `structured` (`summer-sale_platform_preset_1080x1920_p02.png`). People can change this in the download dialog |
| `EXPORT_FILENAME_TIMESTAMP` | `false` | End structured file names with the Unix time of the export |

## Image optimization

See [image-optimization.md](../integrations/image-optimization.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `IMAGE_OPTIMIZERS` | `builtin` | Optimizers people may pick, in order, comma separated: `builtin`, `tinypng`, `kraken`, `custom`. One that isn't set up is left out. Empty: no optimizing |
| `IMAGE_OPTIMIZER_DEFAULT` | `builtin` | The optimizer `optimize: true` uses |
| `IMAGE_OPTIMIZER_TIMEOUT` | `30` | Time limit in seconds for optimizing one file. When it runs out, the file is kept unoptimized |
| `IMAGE_OPTIMIZER_MAX_BYTES` | `26214400` (25 MB) | Largest file optimized, and the largest PNG `POST /api/v1/exports/optimize/` takes |
| `TINYPNG_API_KEY` | | TinyPNG API key |
| `KRAKEN_API_KEY` | | Kraken.io API key |
| `KRAKEN_API_SECRET` | | Kraken.io API secret |
| `IMAGE_OPTIMIZER_CUSTOM_NAME` | `Custom` | The name people see for the custom optimizer |
| `IMAGE_OPTIMIZER_CUSTOM_URL` | | Address of an optimizer that follows the [custom contract](../integrations/image-optimization.md#custom-optimizer-contract) |
| `IMAGE_OPTIMIZER_CUSTOM_KEY` | | Sent to the custom optimizer as `Authorization: Bearer …`. Empty: no header |

## Video clips

See [video.md](video.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `VIDEO_ENABLED` | `true` | Take video clips (uploads and stock videos). Needs the ffmpeg and ffprobe commands; the Docker image sets it from `INSTALL_FFMPEG` |
| `FFMPEG_PATH` | `ffmpeg` | The ffmpeg command, or a path to it |
| `FFPROBE_PATH` | `ffprobe` | The ffprobe command, or a path to it |
| `MAX_VIDEO_UPLOAD_BYTES` | `209715200` (200 MB) | Largest clip that can be uploaded or imported. Raise nginx's `client_max_body_size` for `/api/v1/assets/` with it |
| `MAX_VIDEO_DURATION_SECONDS` | `600` | Longest clip, in seconds (the video export's own limit is 10 minutes) |
| `VIDEO_MAX_CONCURRENCY` | `2` | Clips converted at the same time in each API process (the server's total is this times the number of API workers) |
| `VIDEO_TRANSCODE_TIMEOUT_SECONDS` | `900` | Time limit for converting one clip |
| `VIDEO_FFMPEG_THREADS` | `2` | Threads the encoder and filters of one conversion use (decoding the source takes a little more) |
| `VIDEO_DOWNLOAD_DEADLINE_SECONDS` | `90` | Time limit for downloading one stock clip |
| `VIDEO_WORK_DIR` | system temp folder | Where each clip gets its own temporary folder while it is converted |

## Size presets

See [content.md](content.md#size-presets).

| Setting | Default | What it does |
|---------|---------|--------------|
| `DOORY_SIZE_PRESETS_FILE` | | A JSON file (or a folder of them) inside the API container to import every time it starts |
| `DOORY_SIZE_PRESETS_MODE` | `extend` | `extend` adds the file's sizes to the built-in ones; `replace` offers only the file's sizes |

## Email

See [email.md](../integrations/email.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `EMAIL_URL` | `consolemail://` | SMTP server, e.g. `smtp+tls://user:password@smtp.example.com:587`. The default prints emails to the log |
| `DEFAULT_FROM_EMAIL` | `Doory <no-reply@localhost>` | Sender address |
| `EMAIL_SEND_ASYNC` | `true` | Send email in the background, so a slow mail server doesn't slow down requests |

## Google sign-in

See [google-sign-in.md](../integrations/google-sign-in.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `GOOGLE_CLIENT_ID` | | OAuth web client ID. Setting it adds a "Sign in with Google" button |

## OpenID Connect sign-in

| Setting | Default | What it does |
|---------|---------|--------------|
| `OIDC_ISSUER` | | Issuer URL of your identity provider, e.g. `https://auth.example.com/application/o/doory/`. Sign-in is on when this, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are all set |
| `OIDC_CLIENT_ID` | | Client ID of a confidential client registered at the provider, with `SITE_URL/api/v1/auth/oidc/callback/` as its redirect URI |
| `OIDC_CLIENT_SECRET` | | That client's secret |
| `OIDC_BUTTON_LABEL` | `Sign in with SSO` | Text of the sign-in button, e.g. `Sign in with Authentik` |
| `OIDC_BUTTON_ICON` | | Logo on the sign-in button, by name: the file name of an icon in [`frontend/src/assets/sso-icons/`](../../frontend/src/assets/sso-icons/) without `.svg`, e.g. `authentik`, `keycloak`, `authelia`, `pocket-id`, `okta`, `microsoft`, `google`. Empty or unknown: a key icon |
| `OIDC_SCOPES` | `openid email profile` | Scopes to ask for. Must include `openid` |
| `OIDC_TRUST_EMAIL` | `false` | Let a first sign-in use an existing account with the same email address, when the provider says it has verified it. Never applies to staff accounts. Off, people connect their existing account from Settings |

## Stock media

See [stock-media.md](../integrations/stock-media.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `UNSPLASH_ACCESS_KEY` | | API key for the `unsplash` provider |
| `PEXELS_API_KEY` | | API key for the `pexels` provider |
| `PIXABAY_API_KEY` | | API key for the `pixabay` provider |
| `PEXELS_VIDEO_API_KEY` | `PEXELS_API_KEY` | API key for the `pexels_video` provider (stock videos), so clip searches have a quota of their own |
| `PIXABAY_VIDEO_API_KEY` | `PIXABAY_API_KEY` | API key for the `pixabay_video` provider (stock videos) |
| `STOCK_VIDEO_PROVIDERS` | `pexels_video,pixabay_video` | Video providers to offer, in tab order. A provider appears only when it has a key and the server [takes video](video.md) |
| `STOCK_PROVIDERS` | `unsplash,pexels,pixabay` | Providers to offer, in tab order. A provider appears only when its key is set |
| `STOCK_ALL_PROVIDERS` | all of them | Providers the "All" tab searches |
| `STOCK_ALL_TIMEOUT_SECONDS` | `4` | How long the "All" tab waits for each provider |
| `STOCK_DEFAULT_TAB` | `all` | Tab that opens first: `all` or a provider name |
| `STOCK_LANG_FROM_UI` | `true` | Search in the interface language, where the provider supports it |
| `STOCK_PIXABAY_IMAGE_TYPE` | `photo` | `photo`, `illustration`, `vector` or `all` |
| `STOCK_<PROVIDER>_RATE` | `60/m` for freesound, `200/h` for pexels_video | Limit on calls per API key across all users, e.g. `5000/h` or `100/m`. Without it, a provider is paused only when it answers 429 |
| `STOCK_<PROVIDER>_CACHE_SECONDS` | `3600` (`86400` for pixabay, pixabay_video and freesound) | How long search results are cached |
| `STOCK_<PROVIDER>_SAFESEARCH` | off for unsplash, on for the others | Ask the provider to filter out unsafe results |
| `FREESOUND_API_KEY` | | API key for the Freesound tab in the Audio tool |
| `FREESOUND_LICENSES` | `cc0` | Licences to offer: `cc0`, or `cc0,by` to also allow CC BY (the editor then lists the credits to publish). Freesound's API terms cover non-commercial use; a commercial service needs an agreement with Freesound first |

`<PROVIDER>` is the provider's name in capitals, e.g. `STOCK_PEXELS_RATE`, `STOCK_PEXELS_VIDEO_RATE` or `STOCK_FREESOUND_RATE`. Limits and caching only work across
workers when they share a cache (`CACHE_URL`).

## AI image providers

Remote servers for background removal. In-browser removal stays the default. Providers can also be set up in the
admin under "AI providers".

| Setting | Default | What it does |
|---------|---------|--------------|
| `AI_PROVIDERS_ENABLED` | `true` | Offer the configured providers in the editor |
| `AI_PROVIDER_<n>_URL` | | Address of provider `<n>` (1 to 9), e.g. `http://model-server:7000` |
| `AI_PROVIDER_<n>_STYLE` | `doory` | How its API looks: `doory` (the contract at `/api/v1/ai/contract.yaml`), `multipart`, `json`, `mask` or `custom` |
| `AI_PROVIDER_<n>_STYLE_CONFIG` | | JSON details for the style, e.g. `{"path": "/remove", "file_field": "image"}` |
| `AI_PROVIDER_<n>_TASKS` | `background-removal` | Tasks it serves |
| `AI_PROVIDER_<n>_MODELS` | | `name:Label,name2:Label2`. Empty: the server's own list (`doory` style) or its default |
| `AI_PROVIDER_<n>_AUTH_HEADER` | | Header for the key, e.g. `Authorization` or `X-Api-Key` |
| `AI_PROVIDER_<n>_AUTH_VALUE` | | Value sent as is (e.g. `Bearer …`). Never shown in the browser or the logs |
| `AI_PROVIDER_<n>_LABEL` | `Server <n>` | Name shown in the editor |
| `AI_PROVIDER_<n>_SENDS_OFFSITE` | `false` | The editor tells users their image leaves this installation |
| `AI_PROVIDER_<n>_TIMEOUT_SECONDS` | `AI_DEFAULT_TIMEOUT_SECONDS` | Time limit for one call |
| `AI_PROVIDER_<n>_MAX_IMAGE_BYTES` | `AI_MAX_IMAGE_BYTES` | Largest image sent to it |
| `AI_PROVIDER_<n>_DAILY_QUOTA` | `0` | Calls per user per day. `0` means no limit |
| `AI_ALLOWED_PRIVATE_HOSTS` | | Host names a provider may reach on a private network. Others must resolve to public addresses (IP addresses you type are allowed) |
| `BACKGROUND_REMOVAL_DEFAULT` | `device` | Option the editor starts with: `device` (in the browser) or an id from `/api/v1/ai/models/` |
| `AI_OFFSITE_NOTICE` | | Notice under options that send images offsite. Empty: a built-in one |
| `AI_USER_PROVIDERS` | `off` | Whether users may add their own servers: `off`, `staff` or `everyone`. Their servers must be public https hosts |
| `AI_USER_PROVIDERS_ALLOW_HTTP` | `false` | Also allow plain http for users' servers |
| `AI_USER_PROVIDERS_ALLOWED_PORTS` | | Extra ports for users' servers, comma separated. 443 and 8443 always work (80 and 8080 with `AI_USER_PROVIDERS_ALLOW_HTTP`) |
| `AI_MAX_PROVIDERS_PER_USER` | `10` | Servers each user may add |
| `AI_SECRETS_KEY` | | Fernet key that encrypts stored provider keys. Empty: derived from `DJANGO_SECRET_KEY`, so changing that key needs the old one in `DJANGO_SECRET_KEY_FALLBACKS` |
| `AI_SECRETS_KEY_FALLBACKS` | | Earlier `AI_SECRETS_KEY` values, still accepted for reading |
| `AI_DEFAULT_TIMEOUT_SECONDS` | `60` | Time limit for a provider call |
| `AI_MAX_IMAGE_BYTES` | `26214400` (25 MB) | Largest image sent to or read back from a provider |
| `AI_CACHE_SECONDS` | `604800` (7 days) | Identical requests reuse the result this long |

### The reference AI server (Docker)

Read by `docker-compose.yml` for the `ai-server` service (profile `ai`). See [ai-providers.md](ai-providers.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `AI_SERVER_API_KEY` | | Key the server asks for; it doesn't start without one. Use the same value in `AI_PROVIDER_<n>_AUTH_VALUE` |
| `AI_SERVER_MODELS` | `isnet-general-use,u2netp` | Models built into the image and offered. Rebuild the image after changing it |
| `AI_SERVER_DEFAULT_MODEL` | `isnet-general-use` | Model used when a request names none |
| `AI_SERVER_WORKERS` | `1` | Images processed at once; more requests are answered "busy" (429) |
| `AI_SERVER_THREADS` | `4` | CPU threads per image |
| `AI_SERVER_MEM_LIMIT` | `2g` | Memory limit of the container |

## Realtime co-editing

See [realtime.md](realtime.md). The defaults suit most sites.

| Setting | Default | What it does |
|---------|---------|--------------|
| `REALTIME_ENABLED` | `true` | Turn live co-editing on or off |
| `REALTIME_MAX_CONNECTIONS_PER_DESIGN` | `25` | People editing one design at the same time |
| `REALTIME_MAX_CONNECTIONS_PER_USER` | `10` | Connections open at once for one user |
| `REALTIME_CONNECTS_PER_MINUTE` | `60` | New connections per minute from one user |
| `REALTIME_MAX_FRAME_BYTES` | `1048576` | Largest single message |
| `REALTIME_RATE_MESSAGES_PER_SECOND` | `100` | Steady message rate per connection |
| `REALTIME_RATE_BURST` | `300` | Message burst allowed per connection |
| `REALTIME_RATE_BYTES_PER_SECOND` | `1048576` | Steady data rate per connection |
| `REALTIME_RATE_BYTES_BURST` | `4194304` | Data burst allowed per connection |
| `REALTIME_IDLE_TIMEOUT_SECONDS` | `120` | Close connections that have been silent this long |
| `REALTIME_AUTH_TIMEOUT_SECONDS` | `10` | Time a new connection has to authenticate |
| `REALTIME_RECHECK_SECONDS` | `5` | How often access rights are checked again |
| `REALTIME_FLUSH_INTERVAL_SECONDS` | `10` | How often live edits are saved to the database |
| `REALTIME_COMPACT_AFTER_UPDATES` | `200` | Compact a design's update log after this many updates |
| `REALTIME_SLOW_APPLY_SECONDS` | `2.0` | Log a warning when applying an update takes longer than this |
| `REALTIME_BLOCK_SECONDS` | `600` | How long a client that breaks the limits stays blocked |

## MCP server

See [mcp.md](mcp.md).

| Setting | Default | What it does |
|---------|---------|--------------|
| `MCP_ENABLED` | `false` | Turn on the MCP server at `/mcp`. Docker also needs `COMPOSE_PROFILES=mcp` |
| `MCP_CALLS_PER_MINUTE` | `120` | Tool calls per user per minute. `0` means no limit |
| `MCP_MAX_REQUEST_BYTES` | `4194304` | Largest request |
| `URL_IMAGE_UPLOADS` | `true` | Let the server copy images from public https URLs: `upload_image_from_url` and image links in template fills and bulk create (REST and MCP) |
| `MCP_URL_UPLOADS` | `true` | Old name of `URL_IMAGE_UPLOADS`, still read when that one isn't set |
| `BULK_FILL_MAX_ROWS` | `100` | Rows per bulk create (REST and MCP). Lower it if long runs hit the worker timeout |
| `MCP_EXPORT_INLINE_MAX_BYTES` | `1048576` | `export_design` and bulk create return larger images as a download link instead |
| `MCP_EXPORT_URL_TTL_SECONDS` | `600` | How long those download links work |
