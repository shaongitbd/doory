#!/bin/sh
# Fails when a setting is not documented in docs/self-hosting/configuration.md.
# Settings are collected from both .env.example files, the backend settings and docker-compose.yml.
# Per-provider stock settings (STOCK_UNSPLASH_RATE, STOCK_PEXELS_VIDEO_RATE, …) count as documented by their
# STOCK_<PROVIDER>_… row, and AI_PROVIDER_1_URL … by its AI_PROVIDER_<n>_… row.
# Run from the repository root: sh docs/check-settings.sh   (or: make docs-check)
set -eu

doc=docs/self-hosting/configuration.md

names=$(
    {
        grep -hoE '^#? ?[A-Z][A-Z0-9_]+=' .env.example backend/.env.example | tr -d '#= '
        grep -hoE 'env(\.[a-z]+)?\("[A-Z][A-Z0-9_]+"' backend/doory/settings/*.py | grep -oE '[A-Z][A-Z0-9_]+'
        grep -oE '\$\{[A-Z][A-Z0-9_]+' docker-compose.yml | tr -d '${'
    } | sed -E -e 's/^STOCK_[A-Z_]+_(RATE|CACHE_SECONDS|SAFESEARCH)$/STOCK_<PROVIDER>_\1/' \
        -e 's/^AI_PROVIDER_[0-9]+_/AI_PROVIDER_<n>_/' | sort -u
)

missing=0
for name in $names; do
    if ! grep -qF "\`$name\`" "$doc"; then
        echo "Not documented in $doc: $name"
        missing=1
    fi
done

if [ "$missing" -ne 0 ]; then
    echo "Add a row for each setting above (see CONTRIBUTING.md, Documentation)."
    exit 1
fi
echo "All settings are documented."
