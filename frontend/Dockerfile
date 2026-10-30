# syntax=docker/dockerfile:1

# ---- build the SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the install scripts only matter for the test tooling (`canvas` compiles a native module that has
# no prebuilt binary for Alpine/musl and needs a compiler); the production build needs none of them.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- serve it (unprivileged nginx on :8080) and reverse-proxy the API ----
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
# nginx runs as uid 101, so these must be readable by it even from a checkout made with umask 077. a+rX, not 644:
# COPY gives the folders it creates the same mode, and nginx needs to enter them.
# Rendered into conf.d/default.conf at start-up; only ${NGINX_RESOLVER} is substituted.
COPY --chmod=a+rX nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=a+rx nginx/dns-resolver.envsh /docker-entrypoint.d/05-dns-resolver.envsh
ENV NGINX_ENVSUBST_FILTER=NGINX_RESOLVER
COPY --chmod=a+rX nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
