# syntax=docker/dockerfile:1

# ---- builder: resolve and install Python dependencies into a virtualenv ----
FROM python:3.14-slim AS builder
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- runtime ----
FROM python:3.14-slim AS runtime

# Build with `--build-arg INSTALL_CHROMIUM=true` to add headless Chromium, which server-side PDF
# export needs. The image then advertises the feature through SERVER_PDF_ENABLED. Chromium runs without
# its own sandbox in this image: the container (non-root user) is the isolation boundary.
ARG INSTALL_CHROMIUM=false

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=doory.settings.prod \
    MEDIA_ROOT=/app/media \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    WEB_CONCURRENCY=3 \
    SERVER_PDF_ENABLED=${INSTALL_CHROMIUM} \
    EXPORT_CHROMIUM_NO_SANDBOX=true

RUN groupadd --system --gid 10001 doory \
    && useradd --system --uid 10001 --gid doory --home-dir /app --shell /usr/sbin/nologin doory

COPY --from=builder /opt/venv /opt/venv

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
        playwright install --with-deps chromium \
        && chmod -R a+rX /ms-playwright \
        && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app
COPY --chown=doory:doory . .
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /app/media /app/staticfiles \
    && chown doory:doory /app /app/media /app/staticfiles

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
