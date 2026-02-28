# Penrose-Lamarck Web

The web app renders a single-layer spherical network of exercises.

- Node = one exercise
- Edge = exercises that share at least one class

Data source behavior:

- `WEB_STANDALONE_DEBUG=true`: local mock exercise data in frontend
- `WEB_STANDALONE_DEBUG=false`: graph nodes loaded from `GET /v1/exercise/graph`

The UI is read-only. Exercise creation/classification/import is done via MCP/API, not via web controls.

## Container Runtime Modes

The web container supports two nginx modes selected by `WEB_STANDALONE_DEBUG`.

- `WEB_STANDALONE_DEBUG=false` (default)
  - use `nginx.proxy.conf`
  - `/v1/*` requests proxy to `penroselamarck-api:8080`
- `WEB_STANDALONE_DEBUG=true`
  - use `nginx.standalone.conf`
  - `/v1/*` requests return local debug responses

Runtime switch script:

- `src/penroselamarck/web/docker-entrypoint/40-web-mode.sh`

## GitHub Repository Variable

- `WEB_STANDALONE_DEBUG` (optional, defaults to `false`)
