# syntax=docker/dockerfile:1

# ---- builder: resolve and install Python dependencies into a virtualenv ----
FROM python:3.14-slim AS builder
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- image optimizers: mozjpeg's cjpeg (built from source) and oxipng (the official release) ----
# The built-in optimizer (apps.exports.optimizers) runs them; build with `--build-arg INSTALL_IMAGE_OPTIMIZERS=false`
# to leave them out (about 2 MB). The source tag and the release files are pinned and checked.
FROM python:3.14-slim AS optimizers
ARG INSTALL_IMAGE_OPTIMIZERS=true
ARG MOZJPEG_VERSION=4.1.5
ARG MOZJPEG_COMMIT=6c9f0897afa1c2738d7222a0a9ab49e8b536a267
ARG OXIPNG_VERSION=10.2.1
ARG OXIPNG_SHA256_AMD64=1813750ef592c5350ca79c88f98b2c0876d05c826dc7156245256d4255c1ad17
ARG OXIPNG_SHA256_ARM64=ff21aa2a005b324c8dfbdf13cd2f469fb6728b27dacded82635824ecd12e3b35
RUN mkdir -p /opt/optimizers/bin \
    && if [ "$INSTALL_IMAGE_OPTIMIZERS" = "true" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends ca-certificates curl git cmake nasm build-essential \
        && git clone --depth 1 --branch "v${MOZJPEG_VERSION}" https://github.com/mozilla/mozjpeg /src/mozjpeg \
        && test "$(git -C /src/mozjpeg rev-parse HEAD)" = "$MOZJPEG_COMMIT" \
        && cmake -S /src/mozjpeg -B /build/mozjpeg -DCMAKE_BUILD_TYPE=Release -DENABLE_SHARED=0 \
             -DPNG_SUPPORTED=0 -DWITH_TURBOJPEG=0 -DCMAKE_INSTALL_PREFIX=/opt/mozjpeg \
        && cmake --build /build/mozjpeg -j"$(nproc)" && cmake --install /build/mozjpeg \
        && install -s /opt/mozjpeg/bin/cjpeg /opt/optimizers/bin/cjpeg \
        && case "$(dpkg --print-architecture)" in \
             amd64) arch=x86_64; sum="$OXIPNG_SHA256_AMD64" ;; \
             arm64) arch=aarch64; sum="$OXIPNG_SHA256_ARM64" ;; \
             *) echo "No oxipng release for $(dpkg --print-architecture)" >&2; exit 1 ;; \
           esac \
        && curl -fsSL -o /tmp/oxipng.tar.gz \
             "https://github.com/oxipng/oxipng/releases/download/v${OXIPNG_VERSION}/oxipng-${OXIPNG_VERSION}-${arch}-unknown-linux-musl.tar.gz" \
        && echo "$sum  /tmp/oxipng.tar.gz" | sha256sum -c - \
        && tar -xzf /tmp/oxipng.tar.gz -C /tmp \
        && install /tmp/oxipng-${OXIPNG_VERSION}-${arch}-unknown-linux-musl/oxipng /opt/optimizers/bin/oxipng; \
    fi

# ---- runtime ----
FROM python:3.14-slim AS runtime

# Build with `--build-arg INSTALL_CHROMIUM=true` to add headless Chromium, which server-side PDF
# export needs. The image then advertises the feature through SERVER_PDF_ENABLED. Chromium runs without
# its own sandbox in this image: the container (non-root user) is the isolation boundary.
ARG INSTALL_CHROMIUM=false
# Build with `--build-arg INSTALL_FFMPEG=true` to add the ffmpeg and ffprobe commands, which video clips need
# (upload and stock video). The image then advertises the feature through VIDEO_ENABLED. Debian's ffmpeg is
# GPL-licensed; Doory only runs it as a separate command (see THIRD_PARTY.md).
ARG INSTALL_FFMPEG=false

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=doory.settings.prod \
    MEDIA_ROOT=/app/media \
    EXPORT_STORAGE_ROOT=/app/exports \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    WEB_CONCURRENCY=3 \
    SERVER_PDF_ENABLED=${INSTALL_CHROMIUM} \
    VIDEO_ENABLED=${INSTALL_FFMPEG} \
    EXPORT_CHROMIUM_NO_SANDBOX=true

RUN groupadd --system --gid 10001 doory \
    && useradd --system --uid 10001 --gid doory --home-dir /app --shell /usr/sbin/nologin doory

COPY --from=builder /opt/venv /opt/venv
COPY --from=optimizers /opt/optimizers/bin/ /usr/local/bin/

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
        playwright install --with-deps chromium \
        && chmod -R a+rX /ms-playwright \
        && rm -rf /var/lib/apt/lists/*; \
    fi

RUN if [ "$INSTALL_FFMPEG" = "true" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends ffmpeg \
        && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app
COPY --chown=doory:doory . .
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /app/media /app/exports /app/staticfiles \
    && chown doory:doory /app /app/media /app/exports /app/staticfiles

USER doory
EXPOSE 8000 8001
VOLUME ["/app/media"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "/app/healthcheck.py"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "doory.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--worker-class", "gthread", "--threads", "4", \
     "--timeout", "120", "--graceful-timeout", "30", \
     "--worker-tmp-dir", "/dev/shm", \
     "--access-logfile", "-"]

# The same image also runs the real-time server (WebSockets for co-editing). docker-compose.yml starts it
# as a second service with this command, next to the API above:
#   uvicorn doory.asgi:application --host 0.0.0.0 --port 8001 --ws auto --ws-max-size 2097152 \
#           --lifespan off --workers ${REALTIME_WORKERS:-1}
