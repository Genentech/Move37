---
slug: /
sidebar_position: 1
title: Contributor Guide
description: Start here to understand what Move37 contains, how to get it running, and which path to follow for your first change.
---

## Who this is for

This site is for engineers contributing to the `Genentech/Move37` repository.

The goal is not to describe every file. The goal is to help a new joiner answer four questions quickly:

- What is in this repo?
- Which local setup path should I use?
- Which services matter for the part I am changing?
- Which checks and workflows do I need to care about before opening a PR?

## What is in the repo today

Move37 currently includes:

- a FastAPI API for auth, graph, notes, chat, and MCP transport
- a React and Vite web app
- a hand-written Node SDK plus React hooks
- an internal AI service for semantic note search and note-grounded chat
- a background worker that embeds notes into Milvus
- Docker Compose infrastructure for local runtime, observability, and tracing
- GitHub Actions workflows for CI, GitHub Pages docs, GHCR image publishing, and AWS deployment
- two docs tracks:
  - `contributing-docs/` for repository and contributor guidance
  - `fern/` for public API, SDK, and CLI documentation

## Start here

1. Read [Local Development](./local-development.md) and choose the smallest setup path that matches the work you are doing.
2. Read [Repository Map](./repository-map.md) to learn where code for your area lives.
3. Read [Architecture](./architecture.md) to understand how requests, notes, search, chat, and MCP share the same backend services.
4. Read [Testing And Validation](./testing-and-validation.md) before you touch CI-sensitive code.

## Choose the right path

If you are changing the API, graph rules, models, or notes CRUD:

- start with Python tests and the local API or web smoke path
- you do not need the full observability stack

If you are changing the web UI:

- start the web path in Compose
- expect the web container to talk to the API through nginx

If you are changing semantic note search, note embeddings, or chat:

- you need the AI path, which includes the internal RAG service and the notes worker
- you also need `OPENAI_API_KEY`

If you are changing docs:

- contributor docs run from `contributing-docs/`
- public developer docs run from `fern/`

## Important reality checks

- `docker compose up db api web` does not only start three containers. Because `api` depends on `move37-ai`, Compose also pulls in the AI service and its Milvus dependencies.
- Notes can be created and imported without the worker finishing embeddings, but semantic search and grounded chat depend on the AI service, Milvus, and note-ingestion jobs being processed.
- The current CI coverage is strongest for Python service logic, the Node SDK, the web build, and the contributor docs build. The AI service, notes worker, and infra deployment paths still rely more heavily on manual validation.
