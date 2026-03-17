---
sidebar_position: 3
title: Architecture
description: High-level map of the Move37 backend, web app, SDK surface, and docs ownership.
---

## Backend

`src/move37/api` exposes the FastAPI application. The app is assembled in `server.py`, then routes are composed under `/v1` for both REST and MCP endpoints.

The service layer lives in `src/move37/services`. `ServiceContainer` wires database access and domain services, while repository and model packages handle persistence concerns.

The database image and migrations are split intentionally:

- `src/move37/db`: database container image and initialization scripts
- `src/move37/alembic`: schema migrations

## Frontend

`src/move37/web` is a React app built with Vite and served by nginx in production. The Compose stack routes `/v1` and `/health` back to the API container, so local web development uses the same backend contract as the deployed web container.

## SDKs

The existing JavaScript SDK is in `src/move37/sdk/node`.

The public docs and future SDK generation are now centered in `fern/`:

- export FastAPI OpenAPI from code
- generate TypeScript and Python SDKs from the exported spec
- render API reference with SDK snippets
- add CLI guides alongside the API reference

## Documentation split

Move37 now has two intentionally separate documentation surfaces:

- `contributing-docs/`: internal contributor and repository-operating documentation
- `fern/`: external developer-facing API, SDK, and CLI documentation

Do not mix these audiences. If a page is about repository setup, development process, CI, or deployment ownership, it belongs in `contributing-docs`. If it teaches users how to call the API, use an SDK, or operate the CLI, it belongs in `fern`.
