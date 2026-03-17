---
sidebar_position: 8
title: Troubleshooting
description: Common local setup failures and the quickest way to reason about them.
---

## `docker compose` fails because `move37-network` does not exist

Create it once:

```bash
docker network create move37-network
```

Both the local Compose stack and the devcontainer expect that external network.

## `docker compose up db api web` starts more services than expected

That is normal with the current Compose graph.

- `api` depends on `move37-ai`
- `move37-ai` depends on the Milvus services

So a “small” API startup still pulls in the AI service and vector-store dependencies.

## Authenticated API requests return `401`

The API protects `/v1/*` with a bearer token.

Default local values in Compose are:

- token: `move37-dev-token`
- subject: `local-user`

Smoke test:

```bash
curl -s http://localhost:18080/v1/auth/me \
  -H "Authorization: Bearer move37-dev-token"
```

If that fails, inspect the `api` container environment or any `.env` overrides you introduced.

## Search or grounded chat returns `503`

The main API maps upstream AI failures to `503`.

Check:

- is `move37-ai` running?
- is `OPENAI_API_KEY` set?
- can `move37-ai` reach Milvus?
- are there embeddings for the notes you expect to search?

Useful logs:

```bash
docker compose logs -f api
docker compose logs -f move37-ai
docker compose logs -f move37-notes-worker
```

## Notes are created, but search returns no results

That usually means note ingestion is incomplete, not that CRUD is broken.

Remember the chain:

1. note saved to Postgres
2. embedding job queued
3. worker processes job
4. Milvus updated
5. search can now find chunks

If `move37-notes-worker` is not running, this chain stops at step 2.

## Imported notes fail unexpectedly

The current note-import path only supports text files with:

- UTF-8
- UTF-8 BOM
- UTF-16

It also only accepts `.txt` files.

## `mv37-devtools` fails immediately

The wrapper requires:

- `docker`
- `gh`
- successful `gh auth`

If `gh auth status` fails, the wrapper exits before running the container.

## Contributor docs build or dev server fails

Make sure you installed the site dependencies from `contributing-docs/`:

```bash
cd contributing-docs
npm install
```

The same rule applies to the web app and SDK packages in their own directories.

## Devcontainer setup feels broken

Check the order:

1. create `move37-network`
2. build the devcontainer image set
3. reopen in container

If the devcontainer opens but tools are missing, inspect:

- `.devcontainer/devcontainer.json`
- `.devcontainer/compose.yml`
- `.devcontainer/scripts/postCreate.sh`
- `.devcontainer/scripts/postStart.sh`

## You changed routes or schemas, but Fern docs look stale

Refresh the OpenAPI export:

```bash
cd fern
python3 scripts/export_openapi.py
```

Or restart the Fern preview container:

```bash
docker compose --profile docs up --build fern-docs
```
