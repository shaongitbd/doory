# Third-party software, assets and licences

Doory is released under the Attribution Assurance License ([LICENSE](LICENSE)), which requires credit to its author. It may only bundle, depend on or download material under a
permissive licence: MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, CC0-1.0, OFL-1.1, Unlicense, Python-2.0 and licences
of the same kind (MIT-0, Zlib, BlueOak-1.0.0, PSF-2.0, MIT-CMU, ZPL-2.1). Anything else (AGPL, GPL, LGPL, MPL,
CC-BY, CC-BY-SA, CC-BY-NC, custom or "free for ..." terms) needs a recorded decision, listed under
[Decisions](#decisions-everything-that-is-not-plain-permissive) below.

| File | What it is |
|------|------------|
| [LICENSE](LICENSE) | The licence of Doory itself: the Attribution Assurance License, held by Siam |
| [NOTICE](NOTICE) | The attribution notices that travel with the product |
| THIRD_PARTY.md (this file) | Direct dependencies, bundled and downloaded assets, decisions |
| [licenses/DEPENDENCIES.md](licenses/DEPENDENCIES.md) | Every direct and transitive npm and Python package: version, declared range, licence, source (generated) |
| [licenses/bundled-licenses.txt](licenses/bundled-licenses.txt) | The licence texts of everything that is served to browsers (generated) |
| [licenses/exceptions.json](licenses/exceptions.json) | The decisions below in machine-readable form, corrections of wrong package metadata, and the one-line purpose of every direct dependency |
| [licenses/audit.py](licenses/audit.py) | Produces the generated files and checks this one |

## Keeping this file correct

```bash
cd frontend && npm ci && cd ..                       # the script reads the installed npm packages
backend/.venv/bin/python licenses/audit.py --check  # or the Python of any environment with backend/requirements-dev.txt
backend/.venv/bin/python licenses/audit.py --write  # after changing a dependency: rewrites the generated files
```

`--check` fails when a package has no licence information or a non-permissive licence without a decision in
`licenses/exceptions.json`, when a licence file mentions a copyleft licence that the package metadata does not
(for example an MPL text hidden behind an "MIT" field), when a direct dependency has no one-line purpose in `exceptions.json`
(the tables below are generated from it), when `licenses/DEPENDENCIES.md` or `licenses/bundled-licenses.txt` are out of date, and when this file
disagrees with the data manifests: every pack of `backend/data/element_packs.json` (licence, notice, exact
release), every model of `backend/data/ml_models.json`, the licence and size of `backend/data/audio_library.json`,
and the fonts the starter templates use. It builds the frontend once (about 25 s) with source maps to find out
which packages really reach the browser (`--no-build` skips that and treats every non-dev package as shipped).
The licence of a package is read from its own `package.json` or metadata and from its licence files, never from
memory; a few corrections are recorded with the evidence in `exceptions.json`.

## Result

Read from 466 npm packages (the per-platform binaries of esbuild, rollup and similar count once per family) and 81 Python packages (see [licenses/DEPENDENCIES.md](licenses/DEPENDENCIES.md)):

* **Shipped to browsers (45 npm packages):** MIT, ISC, Apache-2.0, BSD-3-Clause and OFL-1.1, plus three
  licence choices resolved below (DOMPurify, rgbcolor, pako). Nothing copyleft.
* **Server runtime (57 Python packages):** permissive, except `psycopg2-binary` (LGPL-3.0-or-later, the PostgreSQL
  driver) and `certifi` (MPL-2.0, the CA list). Both are accepted with the reasons below.
* **Development and tests only (421 npm, 24 Python packages):** permissive, except `axe-core` and
  `@axe-core/playwright` (MPL-2.0), `hypothesis` (MPL-2.0) and `caniuse-lite` (CC-BY-4.0), none of which is
  shipped or redistributed.

## Decisions: everything that is not plain permissive

| Item | Licence | Where it is used | Decision |
|------|---------|------------------|----------|
| `psycopg2-binary` | LGPL-3.0-or-later with an OpenSSL exception | Server runtime: Django's PostgreSQL driver | **Accept, with a condition.** A separate library installed unmodified from PyPI and imported dynamically; Doory contains none of its code, so Doory keeps its own licence and an operator can replace the library. psycopg 3 is LGPL-3.0 as well and Django supports no permissive PostgreSQL driver, so a swap would not help. Condition: never vendor or patch it |
| `certifi` | MPL-2.0 | Server runtime (a dependency of `requests`) | **Accept.** File-level copyleft on the CA certificate list (data), installed unmodified from PyPI. `botocore` vendors the same Mozilla bundle |
| `hypothesis` | MPL-2.0 | Python tests only (`requirements-dev.txt`) | **Accept, dev/test only.** Used unmodified; the Dockerfile installs only `requirements.txt`, so it is neither in the image nor redistributed |
| `axe-core`, `@axe-core/playwright` | MPL-2.0 | The end-to-end accessibility spec only | **Accept, dev/test only.** Unmodified, not in the production bundle (checked from its source maps), not redistributed |
| `caniuse-lite` | CC-BY-4.0 (data) | Build tooling: browserslist, through the Vite React plugin | **Accept, build only.** Not in the bundle or in any image, so nothing is distributed that would need the attribution |
| `dompurify` | MPL-2.0 OR Apache-2.0 | Browser bundle, as an optional dependency of `jspdf` (only used by jsPDF's HTML import, which Doory does not call) | **Use under Apache-2.0** |
| `rgbcolor` | MIT OR SEE LICENSE IN FEEL-FREE.md | Browser bundle, through `canvg` and `jspdf` | **Use under MIT.** Its `LICENSE.md` is the MIT text (Copyright (c) 2016 Stoyan Stefanov); `FEEL-FREE.md` is a courtesy note |
| `pako` | MIT AND Zlib | Browser bundle, through `jspdf` and its `fast-png` | Both are permissive; the notices are in `licenses/bundled-licenses.txt` |
| `guid-typescript` | ISC, declared in `package.json` only | Inlined in the `onnxruntime-web` bundle | **Accept; cannot be fully verified.** Neither the npm package nor its repository carries a licence text, only the ISC declaration |
| `onnxruntime-web`'s `.wasm` file | MIT, plus the third-party components of onnxruntime | Browser, loaded for background removal | **Accept.** Served unmodified from the npm package; the components Microsoft built into it are listed in [ThirdPartyNotices.txt](https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt) of the onnxruntime repository. That list includes Eigen under MPL-2.0 (file-level copyleft, source at https://gitlab.com/libeigen/eigen); it was not possible to confirm from the binary which listed components the CPU WebAssembly build contains |
| U²-Net weights (`u2netp`, `u2net`) | Apache-2.0 as released by the authors; see [the model section](#background-removal-models) | Downloaded by `sync_models`, never committed | **Accept, residual risk documented below** |
| Ubuntu and Ubuntu Mono fonts | UFL-1.0 (Ubuntu Font Licence 1.0) | Two of the 253 curated families, downloaded by `sync_fonts`; `ubuntu` is among the first 100 | **Not in the permissive list; flagged for the product owner.** The UFL is the font equivalent of the OFL: free use, embedding and redistribution, with the font itself kept under the same licence and renamed when modified; documents made with the fonts are unaffected. Doory never modifies or commits them. The Ubuntu woff2 files carry no licence text in their `name` table. To drop both families, remove the two entries from `popular_fonts.json` and `ubuntu` from `PERMISSIVE_LICENSE` in `apps/fonts/sync.py` |
| `pdftoppm` (poppler-utils) | GPL-2.0-or-later | Test only: renders PDFs to images in the export tests, which skip when it is missing | **Accept: not a dependency.** A separate command that is never installed in the product image, linked or redistributed |
| `redis:7-alpine` Docker image | Redis 7.4 is RSALv2 or SSPLv1 (source available, not open source); Redis 7.2 and earlier are BSD-3-Clause; Redis 8 adds AGPL-3.0 | `docker-compose.yml`, optional `redis` profile for several real-time workers | **Flagged for the maintainers.** Doory neither contains nor redistributes Redis; the compose file names an image that operators pull, and the floating tag `7-alpine` is Redis 7.4.11 today (checked 2026-10-09). A permissive choice with the same protocol: `redis:7.2-alpine` (7.2.16, BSD-3-Clause) or `valkey/valkey:8-alpine` (BSD-3-Clause). The Python client `redis` is MIT |
| Chromium (installed by `playwright install` when `INSTALL_CHROMIUM=true`, and by Playwright for the test suites) | BSD-3-Clause for Chromium, with many third-party components (some LGPL) | Server-side print PDF and the browser suites | **Accept: not redistributed.** The operator's image build downloads it; Doory ships none of it |
| `ffmpeg` and `ffprobe` (Debian's `ffmpeg` package, installed when `INSTALL_FFMPEG=true`, or by the operator) | GPL-2.0-or-later as Debian builds it (with libx264); FFmpeg itself is LGPL-2.1-or-later | Video clips: checks uploads and stock videos and converts them to H.264 MP4, with a poster, a filmstrip and the sound (`apps/assets/video.py`) | **Accept: a separate program, flagged for the maintainers.** Doory runs the two commands as child processes with a fixed argument list; it doesn't link to FFmpeg's libraries, import bindings or include any of its code, so the GPL doesn't reach Doory. The operator's image build installs the Debian package (like Chromium). If a published image includes it, that image redistributes a GPL program and must offer its source (Debian's source package satisfies this). Without it, video is off (`VIDEO_ENABLED`) |
| Stock videos from Pexels and Pixabay | The Pexels License and the Pixabay Content License: free use and editing, including commercial, without credit; no selling or redistributing the clips unchanged | Downloaded on request into a person's uploads, never committed or bundled | **Accept.** Same terms as their photos. The Videos tool credits the providers as their API terms ask |
| Debian, Alpine and nginx base images (`python:3.12-slim`, `nginxinc/nginx-unprivileged`, `postgres:16-alpine`) | Many; nginx is BSD-2-Clause, PostgreSQL has its own permissive licence | Containers | **Accept: not redistributed.** Pulled by operators, never part of this repository |

## Direct dependencies

Versions and licences are read from the lock files and the installed packages; the licence of every transitive
package is in [licenses/DEPENDENCIES.md](licenses/DEPENDENCIES.md). `mp4-muxer`, `mp4box`, `webm-muxer` and `gifenc` are
the small libraries behind the video and GIF export; the type declarations they depend on
(`@types/dom-webcodecs`, `@types/wicg-file-system-access`, MIT) contain no runtime code.

<!-- BEGIN direct-dependencies (generated by licenses/audit.py --write) -->

#### Browser: npm runtime dependencies (`frontend/package.json` `dependencies`)

| Package | Range | Locked | Licence (SPDX) | Use |
|---|---|---|---|---|
| [`@fontsource-variable/caveat`](https://github.com/fontsource/font-files) | `^5.3.0` | 5.3.0 | OFL-1.1 | UI handwriting font (variable Caveat) for notes and captions, served by the app: woff2 files in the bundle |
| [`@fontsource-variable/fraunces`](https://github.com/fontsource/font-files) | `^5.3.0` | 5.3.0 | OFL-1.1 | UI display font (variable Fraunces, with the optical-size axis) for headings and the wordmark, served by the app: woff2 files in the bundle |
| [`@fontsource-variable/inter`](https://github.com/fontsource/font-files) | `^5.3.0` | 5.3.0 | OFL-1.1 | default body font of text in designs (variable Inter), bundled so new text renders instantly and offline: woff2 files in the bundle |
| [`@fontsource-variable/nunito`](https://github.com/fontsource/font-files) | `^5.3.0` | 5.3.0 | OFL-1.1 | UI body font (variable Nunito), served by the app: woff2 files in the bundle |
| [`@fontsource-variable/plus-jakarta-sans`](https://github.com/fontsource/font-files) | `^5.3.0` | 5.3.0 | OFL-1.1 | default heading font of text in designs (variable Plus Jakarta Sans), bundled so new text renders instantly and offline: woff2 files in the bundle |
| [`@tanstack/react-query`](https://github.com/TanStack/query) | `^5.62.0` | 5.104.1 | MIT | server-state cache of the app shell |
| [`fabric`](https://github.com/fabricjs/fabric.js) | `^7.2.0` | 7.4.0 | MIT | canvas engine of the editor |
| [`fflate`](https://github.com/101arrowz/fflate) | `^0.8.3` | 0.8.3 | MIT | ZIP archive of a multi-page image export (lazy-loaded; also a dependency of jspdf) |
| [`gifenc`](https://github.com/mattdesl/gifenc) | `^1.0.3` | 1.0.3 | MIT | colour reduction (PnnQuant) and LZW compression of the animated GIF export (lazy-loaded, 11 kB minified). Dithering and removal of repeated frames are Doory's own (`frontend/src/editor/engine/export/video/gifPixels.ts`) |
| [`jspdf`](https://github.com/parallax/jsPDF) | `^4.2.1` | 4.2.1 | MIT | client-side PDF export (lazy-loaded) |
| [`lib0`](https://github.com/dmonad/lib0) | `^0.2.119` | 0.2.119 | MIT | binary encoding helpers used by the Yjs protocols |
| [`lucide-react`](https://github.com/lucide-icons/lucide) | `^1.52.0` | 1.52.0 | ISC | editor and app icons |
| [`mp4-muxer`](https://github.com/Vanilagy/mp4-muxer) | `^5.2.2` | 5.2.2 | MIT | writes the MP4 file of the video export from WebCodecs output (lazy-loaded, 9 kB gzipped). Its author has deprecated it in favour of Mediabunny, which is MPL-2.0 (file-level copyleft) and so outside the permissive list; 5.2 does what the export needs |
| [`mp4box`](https://github.com/gpac/mp4box.js) | `^2.4.1` | 2.4.1 | BSD-3-Clause | reads the video clips of a design (MP4 boxes and samples) so the video export can decode each frame with WebCodecs (lazy-loaded with the export) |
| [`onnxruntime-web`](https://github.com/Microsoft/onnxruntime) | `^1.30.0` | 1.30.0 | MIT | in-browser model runtime for background removal: the WebAssembly CPU build, loaded lazily and run in a Web Worker (the `.wasm` file is built by Microsoft from onnxruntime and its third-party sources, see the notes below) |
| [`qrcode`](https://github.com/soldair/node-qrcode) | `^1.5.4` | 1.5.4 | MIT | QR code objects (lazy-loaded) |
| [`react`](https://github.com/react/react) | `^19.2.0` | 19.3.0 | MIT | UI library |
| [`react-dom`](https://github.com/react/react) | `^19.2.0` | 19.3.0 | MIT | UI renderer |
| [`react-router-dom`](https://github.com/remix-run/react-router) | `^7.13.0` | 7.18.4 | MIT | routing of the app shell |
| [`webm-muxer`](https://github.com/Vanilagy/webm-muxer) | `^5.1.4` | 5.1.4 | MIT | writes the WebM file of the video export (lazy-loaded, 7 kB gzipped); same deprecation note as `mp4-muxer` |
| [`y-protocols`](https://github.com/yjs/y-protocols) | `^1.0.7` | 1.0.7 | MIT | Yjs sync and awareness wire protocol |
| [`yjs`](https://github.com/yjs/yjs) | `^13.6.33` | 13.6.33 | MIT | CRDT document of real-time co-editing |
| [`zustand`](https://github.com/pmndrs/zustand) | `^5.0.0` | 5.0.15 | MIT | editor state store |

#### Server: Python runtime dependencies (`backend/requirements.txt`)

| Package | Range | Locked | Licence (SPDX) | Use |
|---|---|---|---|---|
| [`boto3`](https://github.com/boto/boto3) | `>=1.35` | 1.43.109 | Apache-2.0 | S3-compatible object storage client (used when `USE_S3` is set) |
| [`brotli`](https://github.com/google/brotli) | `>=1.1` | 1.2.0 | MIT | Brotli codec that fontTools needs to read and write woff2 fonts |
| [`channels`](http://github.com/django/channels) | `>=4.2,<5` | 4.3.2 | BSD-3-Clause | ASGI and WebSocket layer of real-time co-editing |
| [`channels_redis`](http://github.com/django/channels_redis/) | `>=4.2` | 4.3.0 | BSD-3-Clause | shared channel layer for several real-time workers (with `redis-py`, MIT) |
| [`defusedxml`](https://github.com/tiran/defusedxml) | `>=0.7` | 0.7.1 | PSF-2.0 | safe XML parsing in the SVG sanitiser, element import and print layout |
| [`Django`](https://github.com/django/django) | `>=5.2,<5.3` | 5.2.18 | BSD-3-Clause | web framework |
| [`django-cors-headers`](https://github.com/adamchainz/django-cors-headers) | `>=4.7` | 4.9.0 | MIT | CORS headers |
| [`django-environ`](https://github.com/joke2k/django-environ) | `>=0.12` | 0.14.0 | MIT | settings from environment variables |
| [`django-filter`](https://github.com/carltongibson/django-filter) | `>=25.1` | 26.2 | BSD-3-Clause | API filtering |
| [`django-storages`](https://github.com/jschneier/django-storages) | `>=1.14` | 1.14.6 | BSD-3-Clause | S3 storage backend |
| [`django-unfold`](https://github.com/unfoldadmin/django-unfold) | `>=0.60` | 0.108.0 | MIT | theme of the Django admin used for content |
| [`djangorestframework`](https://github.com/encode/django-rest-framework) | `>=3.16` | 3.18.3 | BSD-3-Clause | HTTP API |
| [`drf-spectacular`](https://github.com/tfranzel/drf-spectacular) | `>=0.28` | 0.30.0 | BSD-3-Clause | OpenAPI schema and the staff-only Swagger page |
| [`fonttools`](http://github.com/fonttools/fonttools) | `>=4.50` | 4.66.1 | MIT | inspects uploaded and downloaded font files |
| [`google-auth`](https://github.com/googleapis/google-cloud-python/tree/main/packages/google-auth) | `>=2.38` | 2.61.0 | Apache-2.0 | verifies Google sign-in tokens |
| [`gunicorn`](https://github.com/benoitc/gunicorn) | `>=23` | 26.2.0 | MIT | production WSGI server of the API |
| [`pillow`](https://github.com/python-pillow/Pillow) | `>=11.2` | 12.3.0 | MIT-CMU | validates uploaded raster images, makes thumbnails and encodes server-side image exports (the wheel bundles libjpeg-turbo, libpng, zlib, FreeType, HarfBuzz, LittleCMS, OpenJPEG, libwebp, libavif, libtiff; their notices are in the wheel) |
| [`playwright`](https://github.com/Microsoft/playwright-python) | `>=1.50` | 1.63.0 | Apache-2.0 | drives headless Chromium for server-side print PDF export. The wheel bundles Playwright's Node.js driver (MIT; its dependencies' notices are in `driver/package/ThirdPartyNotices.txt`); the browser itself is downloaded by `playwright install` only when `INSTALL_CHROMIUM=true`, see the decisions above |
| [`psycopg2-binary`](https://psycopg.org/) | `>=2.9` | 2.9.13 | LGPL-3.0-or-later | PostgreSQL driver of Django (the wheel bundles libpq, PostgreSQL licence, and OpenSSL, Apache-2.0) |
| [`pycrdt`](https://github.com/y-crdt/pycrdt) | `>=0.14,<0.15` | 0.14.8 | MIT | Yjs-compatible CRDT, bindings to the Rust `yrs` engine (real-time co-editing) |
| [`pypdf`](https://github.com/py-pdf/pypdf) | `>=5` | 6.19.0 | BSD-3-Clause | writes the TrimBox/BleedBox, `/Lang` and `/Creator` of the PDF Chromium printed; page content is copied unchanged |
| [`requests`](https://github.com/psf/requests) | `>=2.32` | 2.34.2 | Apache-2.0 | outbound HTTP: font, element pack, model and audio pack downloads, stock photo search |
| [`uvicorn`](https://github.com/Kludex/uvicorn) | `>=0.30` | 0.54.0 | BSD-3-Clause | production ASGI server of the real-time service |
| [`websockets`](https://github.com/python-websockets/websockets) | `>=13` | 17.2 | BSD-3-Clause | WebSocket protocol implementation used by uvicorn |
| [`whitenoise`](https://github.com/evansd/whitenoise) | `>=6.9` | 6.12.0 | MIT | serves the admin's static files |

#### Development and tests only: npm (`frontend/package.json` `devDependencies`, and `axe-core`, which `@axe-core/playwright` brings)

| Package | Range | Locked | Licence (SPDX) | Use |
|---|---|---|---|---|
| [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) | `^4.13.0` | 4.13.0 | MPL-2.0 | automated accessibility checks of every shell page in the end-to-end suite (`frontend/e2e/app/a11y.spec.ts`); never part of the app bundle |
| [`@eslint/js`](https://github.com/eslint/eslint) | `^9.39.0` | 9.39.5 | MIT | lint rules |
| [`@playwright/test`](https://github.com/microsoft/playwright) | `^1.50.0` | 1.63.0 | Apache-2.0 | end-to-end test runner |
| [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) | `^6.6.0` | 6.9.1 | MIT | unit-test matchers |
| [`@testing-library/react`](https://github.com/testing-library/react-testing-library) | `^16.1.0` | 16.3.3 | MIT | unit-test helpers for React components |
| [`@testing-library/user-event`](https://github.com/testing-library/user-event) | `^14.5.0` | 14.6.7 | MIT | unit-test user input |
| [`@types/node`](https://github.com/DefinitelyTyped/DefinitelyTyped) | `^24.10.0` | 24.19.1 | MIT | type declarations |
| [`@types/qrcode`](https://github.com/DefinitelyTyped/DefinitelyTyped) | `^1.5.6` | 1.5.6 | MIT | type declarations |
| [`@types/react`](https://github.com/DefinitelyTyped/DefinitelyTyped) | `^19.2.0` | 19.3.0 | MIT | type declarations |
| [`@types/react-dom`](https://github.com/DefinitelyTyped/DefinitelyTyped) | `^19.2.0` | 19.3.0 | MIT | type declarations |
| [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react) | `^5.1.0` | 5.2.0 | MIT | React support of the Vite build |
| [`axe-core`](https://github.com/dequelabs/axe-core) | via a direct dependency | 4.13.0 | MPL-2.0 | the accessibility rule engine that `@axe-core/playwright` runs in the page under test; never part of the app bundle |
| [`canvas`](https://github.com/Automattic/node-canvas) | `^3.2.3` | 3.2.3 | MIT | node-canvas for unit tests in jsdom |
| [`eslint`](https://github.com/eslint/eslint) | `^9.39.0` | 9.39.5 | MIT | linter |
| [`eslint-plugin-react-hooks`](https://github.com/facebook/react) | `^7.0.0` | 7.1.1 | MIT | lint rules |
| [`eslint-plugin-react-refresh`](https://github.com/ArnaudBarre/eslint-plugin-react-refresh) | `^0.4.24` | 0.4.26 | MIT | lint rules |
| [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) | `^6.2.5` | 6.2.5 | Apache-2.0 | IndexedDB for unit tests |
| [`globals`](https://github.com/sindresorhus/globals) | `^16.5.0` | 16.5.0 | MIT | lint configuration |
| [`jsdom`](https://github.com/jsdom/jsdom) | `^26.0.0` | 26.1.0 | MIT | DOM for unit tests |
| [`msw`](https://github.com/mswjs/msw) | `^2.15.0` | 2.15.0 | MIT | HTTP mocking in unit tests |
| [`typescript`](https://github.com/microsoft/TypeScript) | `~5.9.3` | 5.9.3 | Apache-2.0 | type checker and compiler |
| [`typescript-eslint`](https://github.com/typescript-eslint/typescript-eslint) | `^8.48.0` | 8.71.0 | MIT | lint rules for TypeScript |
| [`vite`](https://github.com/vitejs/vite) | `^7.3.0` | 7.3.6 | MIT | dev server and production bundler |
| [`vitest`](https://github.com/vitest-dev/vitest) | `^3.2.0` | 3.2.7 | MIT | unit-test runner |

#### Development and tests only: Python (`backend/requirements-dev.txt`)

| Package | Range | Locked | Licence (SPDX) | Use |
|---|---|---|---|---|
| [`daphne`](https://github.com/django/daphne) | `>=4.1` | 4.2.3 | BSD-3-Clause | ASGI development server (not installed in the production image) |
| [`factory_boy`](https://github.com/FactoryBoy/factory_boy) | `>=3.3` | 3.3.3 | MIT | test data factories |
| [`hypothesis`](https://github.com/HypothesisWorks/hypothesis) | `>=6.100` | 6.168.5 | MPL-2.0 | property-based tests; never installed in the production image or redistributed with the product |
| [`pytest`](https://github.com/pytest-dev/pytest) | `>=8` | 9.1.1 | MIT | test runner |
| [`pytest-django`](https://github.com/pytest-dev/pytest-django) | `>=4.9` | 4.14.0 | BSD-3-Clause | Django integration of pytest |
| [`ruff`](https://github.com/astral-sh/ruff) | `>=0.8` | 0.16.10 | MIT | linter and formatter |

<!-- END direct-dependencies -->

Test only: `yjs`, `y-protocols` and `lib0` also form the reference Yjs client of
`backend/apps/collab/tests/interop` (pinned in its own `package.json`, installed with `npm ci` there, never shipped).

## Assets in this repository

Everything below was made for Doory, except the five starter-template photos (public domain, CC0, listed in
"Starter template photos"). The bunny mascot's origin is recorded in its row. There is no third-party music or font
file in the repository.

| Asset | Source | Licence |
|-------|--------|---------|
| Built-in shapes: the SVG files written by `backend/data/generate_shapes.py` (168 geometric shapes, lines, frames, arrows) | Original work generated from code in this repository | CC0-1.0 |
| Built-in graphics: the SVG files written by `backend/data/generate_graphics.py` (404 backgrounds and patterns, frames and badges, dividers and borders, speech bubbles, social-media glyphs, sale badges, charts and doodles; the lettering is drawn in `backend/data/graphics/lettering.py`) | Original work generated from code in this repository | CC0-1.0 |
| Starter templates: `backend/data/templates/*.json` and `thumbs/*.webp` (ten templates), generated by `frontend/scripts/templates/` from original compositions, shapes and sample copy; no third-party artwork or logos. Five of them show one of the CC0 photos below. The thumbnails are pictures of the compositions rendered in the fonts listed below | Original work generated from code in this repository | Attribution Assurance License, like the code |
| Audio library: the 24 music loops and 88 sound effects under `backend/data/audio/` (Opus in Ogg, about 7 MB) and `backend/data/audio_library.json`, written by `backend/tools/audio/` (a deterministic synthesiser: oscillators, filters, a feedback-delay reverb, seeded note generators; no samples, recordings or third-party music). Encoding uses the `ffmpeg` command-line tool with libopus (BSD-3-Clause) at generation time only; nothing of it ships | Original work generated from code in this repository | CC0-1.0 |
| The bunny mascot: `frontend/src/assets/bunny-sticker.webp` and `bunny-mark.webp` (the logo mark, the landing page, the auth screens and the footer) | Generated with ChatGPT (OpenAI) by the project maintainer on 2026-10-18. It replaces the earlier bunny of 2026-10-10, also generated with ChatGPT by the maintainer, which was swapped out because it looked closer to existing stock artwork. The white background was removed and the sticker border, shadow and sizes made from it with Pillow | Owned by the project maintainer (OpenAI's terms assign generated images to the user); distributed under the Attribution Assurance License, like the code |
| Favicon, app icons and share image: `frontend/public/icons/*.png` (the bunny's head on a lilac tile) and `frontend/public/og-image.png` (the bunny with "Make something lovely today." set in Fraunces, Nunito and Caveat, OFL-1.1), made from the bunny above | Original work around the bunny artwork | Attribution Assurance License, like the code |
| `frontend/public/manifest.webmanifest`, `robots.txt` | Original work | Attribution Assurance License, like the code |
| README images: `.github/readme/*` (the banner, a screen recording of the editor, screenshots of Doory and a collage of its starter templates) | Original work; the templates in them show the CC0 photos listed under "Starter template photos" | Attribution Assurance License, like the code, for everything but those photos |
| Test fonts `frontend/e2e/editor/fixtures/fonts/*.ttf, *.woff2` (solid blocks and diamonds instead of letters), generated by `make_fonts.py` next to them with fontTools; they contain no third-party outlines | Original work generated from code in this repository | CC0-1.0 |
| `backend/data/popular_fonts.json` and `backend/data/unicode_ranges.json` (family ids and names, categories, script and subset names, CSS unicode ranges) | Compiled from the public Fontsource API metadata (Fontsource is MIT licensed); the unicode ranges follow the subset definitions published with Fontsource | MIT (data) |

## Sign-in button logos

The 174 SVG files in `frontend/src/assets/sso-icons/` are the logos an admin can put on the single sign-on button
(`OIDC_BUTTON_ICON`). Each is a separate lazy chunk: a page downloads only the one the server names. They were
normalized (a `viewBox`, no fixed size) and minified with SVGO; `sources.json` next to them gives the source URL and
licence of every file, and `ssoIcons.test.ts` checks that each file has a permissive entry there.

| Files | Source | Licence |
|-------|--------|---------|
| 144, e.g. `okta`, `auth0`, `ory`, `openid`, `clerk` and most of the consumer and developer brands | Simple Icons 16.35.0 (https://simpleicons.org), filled with the brand colour Simple Icons records | CC0-1.0 |
| 23, e.g. `authentik`, `microsoft`, `google`, `github`, `aws` | homarr-labs dashboard-icons (https://github.com/homarr-labs/dashboard-icons) | Apache-2.0 |
| `keycloak`, `authelia`, `dex`, `rauthy` | The projects' own repositories (keycloak-web, authelia, dexidp/dex, sebadob/rauthy) | Apache-2.0 |
| `gitea`, `gitlab` | The projects' own repositories (go-gitea/gitea, gitlab-org/gitlab-svgs) | MIT |
| `apple` | Bootstrap Icons 1.13.2 | MIT |

The logos are trademarks of their owners; a permissive licence on the file does not grant trademark rights. They are
shown only to name the provider an admin has configured, unchanged apart from minification. Logos whose artwork is
under a copyleft, attribution or custom licence (Nextcloud, Zitadel, Kanidm, Forgejo, Logto, HedgeDoc, Jenkins,
Webex, the selfh.st icons) or under no licence at all (Hanko, Kinde) are left out; those providers get the key
icon.

## Starter template photos

`backend/data/templates/photos/*.webp`: five photos from StockSnap, which publishes every photo under CC0 1.0 (public
domain dedication: no attribution required, commercial use and changes allowed). They were downloaded from the pages
below on 2026-10-14 and 2026-10-15 and scaled to 2000 px on the long side as WebP; `seed_templates` copies them to media storage, and a
person who opens one of these templates gets a copy of the photo in their design. The photographers are credited
anyway.

| File | Photo | Photographer | Licence |
|------|-------|--------------|---------|
| `sale-bags.webp` (Bold sale announcement) | [People Girl](https://stocksnap.io/photo/people-girl-R33KBON2SV) | Porapak Apichodilok | CC0-1.0 |
| `rooftop-friends.webp` (Rooftop event story) | [Group Friends](https://stocksnap.io/photo/group-friends-M16QHPDGYJ) | Helena Lopes | CC0-1.0 |
| `deck-architecture.webp` (Modern pitch deck) | [Architecture White](https://stocksnap.io/photo/architecture-white-ANHSBJP1Z1) | Fuse Brussels | CC0-1.0 |
| `resume-portrait.webp` (Modern resume) | [Business Woman](https://stocksnap.io/photo/business-woman-FPQIEQBMPA) | Direct Media | CC0-1.0 |
| `youtube-face.webp` (Bold YouTube thumbnail) | [Smiling Man](https://stocksnap.io/photo/smiling-man-3LMPSCJQGQ) | Matt Moloney | CC0-1.0 |

## Fonts

| Font | Source | Licence |
|------|--------|---------|
| Nunito (variable, upright and italic), the interface's body font, served to every visitor: woff2 files in the app bundle — `@fontsource-variable/nunito` | https://fontsource.org/fonts/nunito, Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito) | OFL-1.1 |
| Fraunces (variable, weight and optical size, upright and italic), the interface's display font, the same way — `@fontsource-variable/fraunces` | https://fontsource.org/fonts/fraunces, Copyright 2020 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces) | OFL-1.1 |
| Caveat (variable), the interface's handwriting font, the same way — `@fontsource-variable/caveat` | https://fontsource.org/fonts/caveat, Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat) | OFL-1.1 |
| Inter (variable), the default body font of text in designs, the same way — `@fontsource-variable/inter` | https://fontsource.org/fonts/inter, Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | OFL-1.1 |
| Plus Jakarta Sans (variable), the default heading font of text in designs, the same way — `@fontsource-variable/plus-jakarta-sans` | https://fontsource.org/fonts/plus-jakarta-sans, Copyright 2020 The Plus Jakarta Sans Project Authors (https://github.com/tokotype/PlusJakartaSans) | OFL-1.1 |
| The editor's font catalogue: fonts fetched at run time by `manage.py sync_fonts` (never committed; stored under `MEDIA_ROOT/fonts/system/`; served unmodified to the browsers that open a design) | Fontsource npm packages `@fontsource/<id>` via jsDelivr, the 253 families of `backend/data/popular_fonts.json` | Each family keeps its own licence. Checked against the Fontsource API on 2026-10-09: 239 families OFL-1.1, 12 Apache-2.0 (Permanent Marker, Satisfy, Yellowtail, Rock Salt, Schoolbell, Roboto Slab, Chewy, Luckiest Guy, Special Elite, Just Another Hand, Homemade Apple, Walter Turncoat), 2 UFL-1.0 (see the decisions). `sync_fonts` accepts only OFL, SIL, Apache, UFL and Ubuntu families and records the licence on `FontFamily.license` |
| Fonts the starter templates use (Anton, Archivo, Lora, Oswald, Pinyon Script, Playfair Display): fetched at build time by `npm run templates:build` into `frontend/node_modules/.cache/` (never committed) to measure and photograph the text; installed for users by `manage.py sync_fonts` | Fontsource npm packages `@fontsource/<id>` via jsDelivr | OFL-1.1 |
| Fonts that users upload | The users | Their own; they are stored with the licence `user-supplied` (`apps/fonts/uploads.py`), never committed and not part of the catalogue |

The OFL asks that the copyright notice and licence travel with the font. The OFL text with the copyright line of each of
the five bundled families is in [licenses/bundled-licenses.txt](licenses/bundled-licenses.txt).

The catalogue fonts are Fontsource's subsetted woff2 files. Measured on 2026-10-09 on the 248 files that
`sync_fonts --popular 100` installs: every file carries its copyright notice in the `name` table, and 97 of the 100
families also carry the licence description or address there. Tangerine, Ubuntu and Yellowtail carry the copyright only;
their licence is recorded on `FontFamily.license` and in this file. The files are served unmodified from the
operator's own server as web fonts; Doory never commits or republishes them.

## Icon, emoji and illustration packs

Fetched at run time by `manage.py sync_element_packs` (never committed; stored under `MEDIA_ROOT/elements/`; the list
of packs, exact releases and integrity hashes is `backend/data/element_packs.json`). Only MIT, ISC, Apache-2.0,
OFL-1.1, CC0-1.0, BSD and Unlicense are accepted by the manifest loader; the licence and notice are stored on
`ElementPack` and returned by `GET /api/v1/elements/packs/`. The eight generated packs ("Backgrounds & Patterns",
"Frames & Badges", "Dividers & Borders", "Speech Bubbles & Callouts", "Social Media", "Sale & Promo", "Charts",
"Doodle Accents") are the CC0 graphics listed above.

| Pack | Source | Licence |
|------|--------|---------|
| "Lucide" | npm `lucide-static@1.52.0`, https://lucide.dev | ISC (Lucide) and MIT (icons derived from Feather), notice below |
| "Tabler Outline", "Tabler Filled" | npm `@tabler/icons@3.48.0`, https://tabler.io/icons | MIT, notice below |
| "Phosphor Regular", "Phosphor Bold", "Phosphor Fill", "Phosphor Duotone" | npm `@phosphor-icons/core@2.1.1`, https://phosphoricons.com | MIT, notice below |
| "Bootstrap Icons", "Bootstrap Icons Fill" | npm `bootstrap-icons@1.13.2`, https://icons.getbootstrap.com | MIT, notice below |
| "Heroicons Outline", "Heroicons Solid" | npm `heroicons@2.2.0`, https://heroicons.com | MIT, notice below |
| "Material Outlined", "Material Filled" | npm `@material-symbols/svg-400@0.47.6`, https://fonts.google.com/icons | Apache-2.0, notice below |
| "Noto Emoji" | npm `@iconify-json/noto@1.2.9` (Iconify packaging of the Noto Emoji SVGs), https://github.com/googlefonts/noto-emoji | Apache-2.0 (artwork licence: `svg/LICENSE` in the repository), notice below |
| "Fluent Emoji" | npm `@iconify-json/fluent-emoji-flat@1.2.6` (Iconify packaging of Microsoft's Fluent Emoji), https://github.com/microsoft/fluentui-emoji | MIT, notice below |
| "Open Doodles" | 32 SVG files pinned by SHA-256 in `backend/data/element_pack_files/open-doodles.json`, https://www.opendoodles.com/ (Pablo Stanley) | CC0-1.0, no attribution required (credit given as a courtesy) |
| "Open Peeps" | 93 SVG files pinned by SHA-256 in `backend/data/element_pack_files/open-peeps.json`, https://www.openpeeps.com/ (Pablo Stanley) | CC0-1.0, no attribution required (credit given as a courtesy) |

The licence declared by each npm release was read again on 2026-10-09 from the npm registry and matches the manifest
(ISC, MIT, MIT, MIT, Apache-2.0, Apache-2.0, MIT); the two CC0 claims were read on the creators' own pages the same
day. The sync also re-checks the licence file of every release at install time and refuses a pack whose text changed.
Candidates that were examined and **not** used (Font Awesome Free, Twemoji, OpenMoji, Remix Icon, Material Design
Icons, unDraw, ...) are not part of Doory.

Brand logos: Tabler (`brand-*`), Phosphor (`*-logo`), Material Symbols (`google_*`, `youtube_*`, `android`, ...) and
Bootstrap Icons (`facebook`, `github`, `twitter-x`, ...) contain third-party logos. They match the pack's `naming.brand` pattern in the manifest and are left out by default,
because logos are trademarks whose owners set usage rules. A self-hosted instance can opt in with
`DOORY_ELEMENTS_BRAND_LOGOS=true` (or `sync_element_packs --brand-logos`). The logos are then tagged `brand` and
`logo`, and the attribution of those packs adds "Logos are trademarks of their respective owners; use them according
to their brand guidelines." Turning the flag off again makes the next sync unpublish them (no `--prune` needed);
designs that already use a logo keep their copy. Turning it back on does not republish them, since `is_published`
belongs to staff; they can republish the logos in the admin.

## Audio packs

The audio library is the original CC0 set above. Optional packs fetched at run time by
`manage.py sync_audio --pack` (none is enabled; the manifest accepts only CC0-1.0, Unlicense and public-domain
dedications, with a pinned archive hash and per-file hashes) are listed in `backend/data/audio_library.json` under
`packs`.

## Freesound sounds

Searched at run time through Freesound's API when `FREESOUND_API_KEY` is set (nothing is bundled). The server only
returns and imports sounds under CC0 1.0, plus CC BY (any version) when `FREESOUND_LICENSES=cc0,by`; NC, Sampling+,
SA and ND sounds are never offered. An imported CC BY sound keeps its author, title, link and licence on the asset
and on the track, and the editor (and the `get_design_credits` MCP tool) gives the lines to publish with the design.
Freesound's [API terms](https://freesound.org/help/tos_api/) cover non-commercial use; commercial use is negotiated
with Freesound (MTG, Universitat Pompeu Fabra).

## Background-removal models

Fetched at run time by `manage.py sync_models` (never committed; stored under `MEDIA_ROOT/models/`; the exact files,
SHA-256 hashes and licence evidence are in `backend/data/ml_models.json`). Only MIT and Apache-2.0 are accepted by
the manifest loader; a `NOTICE.txt` is written next to each model.

| Model | Source | Licence |
|-------|--------|---------|
| U²-Net "small" (`u2netp`, 4.6 MB, default): ONNX export of `u2netp.pth`, pinned file `u2netp.onnx` | https://github.com/xuebinqin/U-2-Net (Xuebin Qin et al.); ONNX export published by https://github.com/danielgatis/rembg (MIT), byte-identical mirror https://huggingface.co/BritishWerewolf/U-2-Netp | Apache-2.0 |
| U²-Net (`u2net`, 176 MB, optional: `sync_models --model u2net`): ONNX export of `u2net.pth`, pinned file `u2net.onnx` | same as above; mirror https://huggingface.co/BritishWerewolf/U-2-Net | Apache-2.0 |

What is known about the weights, as read on 2026-10-09:

* The repository `xuebinqin/U-2-Net` carries the Apache License 2.0 (`LICENSE`). Its README distributes `u2net.pth` and
  `u2netp.pth` as part of the project and states no further terms for them; there is no non-commercial clause in the
  repository. The weights have no licence statement of their own.
* The README says the model was trained on DUTS-TR. The DUTS page (http://saliencydetection.net/duts/) says its training
  images come from the ImageNet DET training and validation sets, and "All rights reserved by the original authors of
  DUTS" for the ground-truth annotations; it grants no licence. ImageNet images belong to their original owners and
  ImageNet is offered for non-commercial research (from general knowledge, not read again today).
* The ONNX files are the export the `rembg` project published (repository licence: MIT) and are byte-identical to the
  Hugging Face mirrors, whose model cards declare `license: apache-2.0`. The SHA-256 of `u2netp.onnx` was recomputed
  from both hosts on 2026-10-09 and equals the pinned value; `u2net.onnx` (176 MB) was not downloaded again.
* **Residual risk:** whether weights trained on a dataset without a licence that permits commercial use are bound by the
  dataset's terms is legally unsettled, and the authors never stated a licence for the weights themselves. Doory takes
  the authors' published position (Apache-2.0 for what the project releases), does not commit or redistribute the
  weights (the operator's own `sync_models` run downloads them, `DOORY_SYNC_MODELS` is off by default), and keeps the
  engine model-agnostic, so a model with cleaner provenance can replace it by editing the manifest.

## Notices

The MIT, ISC and Apache-2.0 licences ask that the copyright notice travel with the artwork. The same text is stored in
`ElementPack.attribution` and returned by `GET /api/v1/elements/packs/`. Licence texts: the `LICENSE` file of each
package (npm), or the repository files listed above. The notices for the code and fonts
served to browsers are in [NOTICE](NOTICE) and [licenses/bundled-licenses.txt](licenses/bundled-licenses.txt).

- **Lucide** — Copyright (c) 2026 Lucide Icons and Contributors (ISC License). The icons derived from the Feather
  project are Copyright (c) 2013-present Cole Bemis (The MIT License).
- **Tabler Icons** — Copyright (c) 2020-2026 Paweł Kuna (MIT License).
- **Phosphor Icons** — Copyright (c) 2023 Phosphor Icons (MIT License).
- **Bootstrap Icons** — Copyright (c) 2019-2024 The Bootstrap Authors (MIT License).
- **Sign-in button logos** (`frontend/src/assets/sso-icons/`) — dashboard-icons, Copyright the homarr-labs
  dashboard-icons contributors (Apache License, Version 2.0); Keycloak, Authelia, Dex and Rauthy logos, Copyright
  their authors (Apache License, Version 2.0); Gitea logo, Copyright (c) 2016 The Gitea Authors (MIT License);
  GitLab logo, Copyright (c) 2011-present GitLab Inc. (MIT License). The logos are trademarks of their owners.
- **Heroicons** — Copyright (c) Tailwind Labs, Inc. (MIT License).
- **Material Symbols** — Copyright Google LLC, licensed under the Apache License, Version 2.0.
- **Noto Emoji** — Copyright 2013 Google, Inc., licensed under the Apache License, Version 2.0.
- **Fluent Emoji** — Copyright (c) Microsoft Corporation (MIT License).
- **U²-Net** (background-removal weights) — by Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R.
  Zaiane and Martin Jagersand, "U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection", Pattern
  Recognition 106 (2020); licensed under the Apache License, Version 2.0
  (https://www.apache.org/licenses/LICENSE-2.0). The weights are not modified.
