---
sidebar_position: 4
title: Architecture
description: Understand how the web app, SDK, API, AI service, worker, and infrastructure fit together before making cross-cutting changes.
---

## The big picture

Move37 is not a single process. It is a small system with a few important boundaries:

- the main FastAPI API owns auth, graph mutations, notes CRUD, chat session persistence, and MCP transport
- the internal AI service owns semantic note search and grounded answer generation
- the notes worker owns embedding jobs and keeps Milvus in sync with notes stored in Postgres
- the web app and Node SDK both talk to the main API, not directly to the AI service
- MCP tools are another transport layer over the same service logic already used by REST

## Main API

`src/move37/api` builds the FastAPI app and exposes:

- REST routes under `/v1`
- MCP routes under `/v1/mcp/*`
- a simple `/health` endpoint

`src/move37/services/container.py` wires the main runtime:

- SQLAlchemy session factory
- `ActivityGraphService`
- `NoteService`
- `ChatSessionService`
- `Move37AiClient`

That last point matters: the main API does not answer note search or chat itself. It forwards those requests to the internal AI service over HTTP.

## REST and MCP surfaces

REST routes currently cover four broad areas:

- auth
- graph
- notes
- chat

MCP routes are exposed separately, but they still land on the same service layer underneath. If you change a service contract or persistence rule, think about both transports.

## Notes, embeddings, and chat

There are three separate flows to understand:

### Notes CRUD flow

1. A user creates or imports a note through the main API.
2. The note is stored in Postgres.
3. A linked graph node is created or updated.
4. A note-embedding job is queued.

This flow works even if the notes worker has not processed the job yet.

### Note search flow

1. The client calls `/v1/notes/search` on the main API.
2. The main API forwards that request to `move37-ai`.
3. `move37-ai` embeds the query and searches Milvus.
4. Matching note chunks are returned to the main API response.

This path depends on:

- `move37-ai`
- Milvus
- embeddings already having been written by the worker
- `OPENAI_API_KEY`

### Grounded chat flow

1. The client creates or loads a chat session through the main API.
2. The client posts a chat message to the main API.
3. The main API forwards the message to `move37-ai`.
4. `move37-ai` retrieves relevant note chunks from Milvus and runs the LangGraph answer flow.
5. The assistant response is persisted back in Postgres.

## Data stores

Move37 currently spreads state across several systems:

- Postgres for the main application state
- Milvus for vector search over note chunks
- Langfuse storage for tracing when enabled
- Prometheus and Loki for observability data when the local observability stack is running

That means a feature can “work” in one layer and still fail end to end if another service is missing.

## Frontend and SDK

`src/move37/web` is a React and Vite app served by nginx in the web container. The nginx config proxies `/v1` and `/health` back to the API container.

`src/move37/sdk/node` is the current hand-written JavaScript SDK. It mirrors the REST API and also ships React hooks that the web app consumes.

The web app is therefore a good reference for how the SDK is expected to feel, while the SDK is a good reference for which API routes are already treated as part of the client surface.

## Documentation split

Move37 intentionally keeps internal and external docs separate:

- `contributing-docs/`: internal contributor and repository-operating documentation
- `fern/`: external developer-facing API, SDK, and CLI documentation

Do not mix those audiences. If a page explains how to run the repo, ship code, or understand CI and deployment, it belongs here. If it teaches someone how to call Move37 as a product or integration surface, it belongs in `fern`.
