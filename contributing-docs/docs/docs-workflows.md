---
sidebar_position: 4
title: Docs Workflows
description: Ownership and deployment rules for contributor docs and the Fern developer portal.
---

## Contributor docs

Contributor docs are published from `contributing-docs/` to GitHub Pages through `.github/workflows/deploy-contributor-docs.yml`.

For the `Genentech/Move37` repository, the default GitHub Pages URL is:

```text
https://genentech.github.io/Move37/
```

The Docusaurus config derives that project-page base path automatically when the GitHub Actions environment is present.

## Fern docs

The Fern workspace lives in `fern/` and is not published by GitHub Pages.

Instead:

- local preview runs in the `fern-docs` Compose service
- the container exports `move37.openapi.json` directly from the FastAPI app before starting the docs server
- SDK generation is configured for local file system output first, so the final publishing target can be chosen later

## SDK generation

Fern is configured for two SDK tracks:

- TypeScript
- Python

The workspace is intentionally set up for local preview first. When you decide the final publishing target, update `fern/generators.yml` with the real package registry and repository settings, then add the corresponding release automation.

## Editing rules

- Update `contributing-docs/` when you change repository shape, local setup, or CI or deployment workflows.
- Update `fern/` when you change the public API, SDK ergonomics, examples, or CLI guidance.
- If you change FastAPI routes or schemas, regenerate the OpenAPI spec before validating the Fern workspace.
