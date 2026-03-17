---
sidebar_position: 7
title: Docs Workflows
description: Ownership and deployment rules for contributor docs and the Fern developer portal.
---

## Contributor docs live in this site

Use `contributing-docs/` for:

- onboarding
- local setup
- repository map
- architecture
- CI and release rules
- troubleshooting
- anything a contributor needs before changing code safely

Publishing model:

- built by `.github/workflows/deploy-contributor-docs.yml`
- published to GitHub Pages
- default project-page URL for `Genentech/Move37`: `https://genentech.github.io/Move37/`

The Docusaurus config derives the project-page base path automatically in GitHub Actions, so local development can still use `/` while the deployed site uses `/Move37/`.

## Fern docs live separately

Use `fern/` for:

- API reference
- SDK docs
- SDK snippets
- CLI guides
- other user-facing integration material

The Fern workspace is not published through GitHub Pages.

Current workflow:

- local preview runs in the `fern-docs` Compose service
- the container exports `move37.openapi.json` from the FastAPI app before starting `fern docs dev`
- SDK generation is configured for local file-system output first
- final public hosting is intentionally still undecided

## When to update both docs tracks

Update `contributing-docs/` and `fern/` together when:

- you add or remove major API capabilities
- the SDK surface changes in a way contributors need to understand
- the OpenAPI export workflow changes
- the local docs development path changes

## Working rules

- If you change FastAPI routes or schemas, regenerate the Fern OpenAPI snapshot before validating public docs.
- If you change setup steps, service names, ports, tags, or CI behavior, update contributor docs in the same PR.
- If you introduce a new deployment or release path, document both who owns it and how a contributor should validate it locally.

## Practical commands

Contributor docs local preview:

```bash
cd contributing-docs
npm install
npm run start
```

Fern local preview:

```bash
docker compose --profile docs up --build fern-docs
```

Manual OpenAPI export for Fern:

```bash
cd fern
python3 scripts/export_openapi.py
```
