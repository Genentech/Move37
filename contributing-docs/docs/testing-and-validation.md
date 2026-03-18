---
sidebar_position: 5
title: Testing And Validation
description: Know what CI runs today, what it does not run, and which manual checks are expected before opening a PR.
---

## What CI runs today

The main CI workflow is `.github/workflows/lint.yml`. It currently runs four jobs:

- `python`: installs the Python requirements for the API, DB, Alembic, and devtools, then runs `unittest` suites in `src/move37/tests` and `devtools/tests`
- `sdk`: installs dependencies in `src/move37/sdk/node` and runs `vitest`
- `web`: installs dependencies in `src/move37/web` and runs a production build
- `contributor-docs`: installs dependencies in `contributing-docs` and runs a Docusaurus build

## What CI does not cover well yet

New contributors should know this up front:

- there is no dedicated CI job for the internal AI service in `src/move37/rag`
- there is no dedicated CI job for the notes worker in `src/move37/worker`
- there is no dedicated CI job for Fern docs
- the AWS deployment workflows are release-oriented, not contributor smoke tests

If you change those areas, manual validation is part of the expected work.

## Recommended validation by change type

If you change Python API, services, repositories, or models:

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

If the change affects routes or runtime behavior, add a local API smoke check:

```bash
docker compose up -d --build db api web
export MOVE37_TOKEN="${MOVE37_API_BEARER_TOKEN:-move37-dev-token}"
curl -s http://localhost:18080/health
curl -s http://localhost:18080/v1/auth/me -H "Authorization: Bearer ${MOVE37_TOKEN}"
```

If you change the SDK:

```bash
cd src/move37/sdk/node
npm install
npm test
```

If you change the web app:

```bash
cd src/move37/web
npm install
npm run build
```

If you change contributor docs:

```bash
cd contributing-docs
npm install
npm run build
```

If you change public API contracts, SDK-generation config, or developer docs:

```bash
docker compose --profile docs up --build fern-docs
```

If you change note search, embeddings, or grounded chat over MCP:

- run the Python tests that still apply
- start the AI path with `OPENAI_API_KEY`
- create or import a note
- verify that the worker processes the embedding job
- verify search or chat end to end

## PR expectations

The pull request template expects you to document:

- which acceptance criteria were completed
- which validations you ran
- key assistant prompts that materially affected the work
- any assistant mistakes you had to correct

Read `.github/pull_request_template.md` before you finalize a PR, not after.

## Branch protection reality

The desired repository ruleset in `devtools/config/move37.repo.toml` currently lists these required status checks:

- `python`
- `sdk`
- `web`

That means the contributor-docs build exists in CI, but it is not yet declared as a required status check in the repo bootstrap config.
