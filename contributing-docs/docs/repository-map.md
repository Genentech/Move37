---
sidebar_position: 3
title: Repository Map
description: Learn where the important code lives so you can find the right layer before making a change.
---

## Root-level layout

These are the directories a new contributor will touch most often:

- `src/move37/api`: FastAPI app, transport schemas, dependencies, and route wiring
- `src/move37/services`: application services and cross-repository orchestration
- `src/move37/repositories`: persistence-layer reads and writes
- `src/move37/models`: SQLAlchemy models
- `src/move37/tests`: current Python test suite
- `src/move37/web`: React and Vite web app plus nginx container assets
- `src/move37/sdk/node`: JavaScript SDK and React hooks
- `src/move37/rag`: internal AI service for note search and MCP-grounded chat
- `src/move37/worker`: background note-embedding worker
- `src/move37/db`: Postgres image and init scripts
- `src/move37/alembic`: migrations
- `src/move37/infra/eks`: AWS CDK deployment app
- `devtools`: repository bootstrap tooling for GitHub settings, rulesets, variables, and secrets
- `contributing-docs`: this contributor site
- `fern`: public API and SDK docs workspace

## If you are changing X, start here

If you are changing REST or MCP transport behavior:

- start in `src/move37/api`
- then trace into `src/move37/services`

If you are changing graph rules or note-linking behavior:

- start in `src/move37/services/activity_graph.py`
- then inspect `src/move37/repositories/activity_graph.py`
- then inspect the related models

If you are changing notes CRUD:

- start in `src/move37/api/routers/rest/notes.py`
- then `src/move37/services/notes.py`
- then `src/move37/repositories/note.py`

If you are changing search or grounded chat:

- start in `src/move37/services/ai_client.py`
- then inspect `src/move37/rag/api.py`, `src/move37/rag/graph.py`, and `src/move37/rag/retrieval.py`
- if embeddings or indexing are involved, inspect `src/move37/worker/runner.py` and `src/move37/vectorstore`

If you are changing the web app:

- start in `src/move37/web/src/App.jsx`
- then inspect `src/move37/web/src/graph.js` for layout logic
- check the SDK hooks because the web app consumes them directly

If you are changing the SDK:

- start in `src/move37/sdk/node/src/client.js`
- then inspect the hook wrappers in `src/move37/sdk/node/src/hooks`

If you are changing deployment behavior:

- local runtime changes usually start in `compose.yml`
- GH Actions changes are in `.github/workflows`
- AWS deployment changes are in `src/move37/infra/eks`

## Files new joiners often miss

- `compose.yml`: this is the most useful single file for understanding the local runtime
- `.github/workflows/lint.yml`: tells you what CI actually validates
- `.github/pull_request_template.md`: tells you what a finished PR is expected to explain
- `devtools/config/move37.repo.toml`: documents the desired repo settings, labels, required secrets, and ruleset behavior
- `fern/README.md`: explains how the public developer docs preview works

## Current naming reality

You will still see some older `mv37` references in comments or helper files. The current repo path and package naming are a mix of older and newer names. Treat `move37` as the active repository and product name unless a specific tool or package path still uses `mv37` as part of an identifier.
