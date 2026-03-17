---
slug: /
sidebar_position: 1
title: Contributor Guide
description: Start here for Move37 repository setup, local development, and docs ownership.
---

## What this site covers

This site is for contributors working in the `Genentech/Move37` repository.

It covers:

- local development with the existing Docker Compose stack
- how the backend, web app, SDK, and infra code are laid out
- where to edit contributor docs versus public developer docs
- the workflows that currently publish and deploy repository artifacts

## Repository shape

The repo is currently organized around a Python API, a React/Vite web app, a Node SDK, and deployment/bootstrap tooling:

- `src/move37/api`: FastAPI application and REST or MCP transport entrypoints
- `src/move37/services`: application services and dependency wiring
- `src/move37/models` and `src/move37/repositories`: persistence layer
- `src/move37/web`: React and Vite web app
- `src/move37/sdk/node`: current JavaScript SDK surface
- `src/move37/db` and `src/move37/alembic`: database image and migrations
- `devtools`: repository bootstrap and policy tooling
- `contributing-docs`: this Docusaurus site
- `fern`: public API, SDK, and CLI docs workspace

## Start here

1. Read [Local Development](./local-development.md) to get the stack running.
2. Read [Architecture](./architecture.md) to understand the boundaries between subsystems.
3. Read [Docs Workflows](./docs-workflows.md) before editing documentation or generated SDK setup.
