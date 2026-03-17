---
sidebar_position: 2
title: Local Development
description: Bring up Move37 locally, run tests, and work on the contributor and developer docs.
---

## Prerequisites

- Docker and Docker Compose
- Node.js 22 for the web app and contributor docs
- Python 3.12 for API and devtools work

## Create the Docker network

The Compose stack expects the external network to exist before startup:

```bash
docker network remove move37-network 2>/dev/null
docker network create move37-network
```

## Bring up the core stack

Start the database, API, and web app:

```bash
docker compose up -d --build db api web
```

Useful endpoints:

- Web UI: `http://localhost:5174`
- API health: `http://localhost:18080/health`
- API auth check: `http://localhost:18080/v1/auth/me`

## Run tests

Python tests:

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

Node SDK tests:

```bash
cd src/move37/sdk/node
npm install
npm test
```

Web build:

```bash
cd src/move37/web
npm install
npm run build
```

## Work on contributor docs

The contributor docs are a standalone Docusaurus site:

```bash
cd contributing-docs
npm install
npm run start
```

The dev server runs on `http://localhost:3001`.

## Work on public developer docs

The public developer docs live in the Fern workspace and are containerized:

```bash
docker compose --profile docs up --build fern-docs
```

The container exports the OpenAPI spec from the FastAPI app and starts the Fern docs preview on `http://localhost:3000`.
