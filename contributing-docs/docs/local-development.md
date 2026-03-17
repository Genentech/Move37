---
sidebar_position: 2
title: Local Development
description: Choose the smallest local setup that matches your task, then verify the stack the same way CI and contributors do.
---

## Prerequisites

- Docker and Docker Compose
- Python 3.12 for API, tests, and devtools work
- Node.js 22 for the web app, SDK, and contributor docs
- `gh` auth on the host if you need repository bootstrap tooling

## Before you start

Create the external Docker network expected by both the local stack and the devcontainer:

```bash
docker network remove move37-network 2>/dev/null
docker network create move37-network
```

Environment variables to know about:

- no extra env vars are required for basic graph, notes CRUD, and web smoke checks
- `OPENAI_API_KEY` is required for semantic note search, note-grounded chat, and successful note embedding
- Langfuse variables are optional locally unless you want tracing to flow to the local Langfuse services
- Docker Compose will read `.env` automatically if you create one at the repo root
- `mv37-devtools` reads `.env` and `.env.local` when planning repository variables and secrets

There is currently no committed `.env.example`, so create your own local file if you need one.

## Choose a startup path

### Fastest repo smoke path

Use this when you are changing API behavior, graph rules, notes CRUD, the SDK, or the web UI and you do not need the notes worker running:

```bash
docker compose up -d --build db api web
```

What this actually starts:

- `db`
- `api`
- `web`
- `move37-ai`
- `milvus-etcd`
- `milvus-minio`
- `milvus-standalone`

The reason is that `api` depends on `move37-ai`, and `move37-ai` depends on the Milvus services.

Useful endpoints for this path:

- Web UI: `http://localhost:5174`
- API health: `http://localhost:18080/health`
- API auth check: `http://localhost:18080/v1/auth/me`
- Internal AI health: `http://localhost:18090/health`

Basic verification:

```bash
export MOVE37_TOKEN="${MOVE37_API_BEARER_TOKEN:-move37-dev-token}"
curl -s http://localhost:18080/health
curl -s http://localhost:18080/v1/auth/me -H "Authorization: Bearer ${MOVE37_TOKEN}"
curl -s http://localhost:18080/v1/graph -H "Authorization: Bearer ${MOVE37_TOKEN}" | jq '.nodes | length'
```

### AI and note-ingestion path

Use this when you are changing:

- semantic note search
- grounded chat
- note embedding behavior
- worker logic
- anything that depends on notes becoming searchable

Set `OPENAI_API_KEY`, then start:

```bash
export OPENAI_API_KEY=...
docker compose up -d --build db api web move37-notes-worker
```

This adds the notes worker on top of the earlier path. Notes will only become searchable after:

- the note is created or imported
- a note-embedding job is queued in Postgres
- `move37-notes-worker` processes that job
- the resulting vectors are written to Milvus

If the worker is not running, notes can still be created but search results and grounded chat will lag or fail.

### Full stack path

Use this when you want every local service, including Langfuse and observability:

```bash
docker compose up -d --build
```

Extra local UIs from this path:

- Langfuse: `http://localhost:3002`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`

### Docs-only paths

Contributor docs:

```bash
cd contributing-docs
npm install
npm run start
```

Public developer docs:

```bash
docker compose --profile docs up --build fern-docs
```

## Run tests and builds

### Python API and service tests

This is the same install shape used in CI:

```bash
python -m pip install --upgrade pip
pip install \
  ./devtools \
  -r src/move37/api/python-requirements.txt \
  -r src/move37/db/python-requirements.txt \
  -r src/move37/alembic/python-requirements.txt \
  httpx
PYTHONPATH=src python -m unittest discover -s src/move37/tests -t src
python -m unittest discover -s devtools/tests
```

### Node SDK tests

```bash
cd src/move37/sdk/node
npm install
npm test
```

### Web build

```bash
cd src/move37/web
npm install
npm run build
```

### Contributor docs build

```bash
cd contributing-docs
npm install
npm run build
```

## Devcontainer path

If you prefer VS Code Dev Containers:

1. create `move37-network`
2. build the devcontainer images with `.devcontainer/init.sh` or the commands documented in `.devcontainer/compose.yml`
3. use `Dev Containers: Reopen in Container`

What the devcontainer gives you:

- Docker tooling
- Python tooling
- Node.js tooling
- `gh`
- port forwards for the main local services

On post-create it currently installs the web app dependencies automatically and attempts to install the OpenAI Codex CLI.

## Stop and reset

Stop containers without deleting volumes:

```bash
docker compose down
```

Remove local state, including Postgres, Milvus, and tracing data:

```bash
docker compose down -v
```

If you are debugging a corrupted local environment, the comment block at the top of `compose.yml` also includes the more destructive `docker system prune -a --volumes` cleanup path.
