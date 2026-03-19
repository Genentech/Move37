---
sidebar_position: 6
title: CI And Release
description: Understand which workflows run on PRs, which ones publish artifacts, and how tag-based releases are modeled.
---

## CI versus release automation

Move37 uses two different categories of GitHub Actions workflows:

- contributor-facing CI, which validates normal changes
- tag-driven release and deployment workflows, which publish containers or deploy AWS infrastructure

Do not assume a release workflow is safe to run casually from a feature branch. Most of them are designed around tags and repository secrets.

For the recommended long-lived branch promotion model, see [GitOps Strategy](./gitops-strategy).

## Contributor-facing workflows

`.github/workflows/lint.yml` runs on:

- pushes to `dev`, `beta`, `rc`, and `stable`
- pull requests

It is the workflow most contributors should care about first.

`.github/workflows/deploy-contributor-docs.yml` runs on:

- pushes to `stable` that touch `contributing-docs/**`
- manual dispatch

It builds and deploys the contributor docs to GitHub Pages.

## Container release workflows

These workflows build and push GHCR images when version tags are pushed:

- `deploy-api.yml`
- `deploy-db.yml`
- `deploy-web.yml`

Container tag pattern examples:

- `v1.2.3-b.1`
- `v1.2.3-a.1`
- `v1.2.3-rc.1`
- `v1.2.3`

The web workflow also emits a metadata artifact that the EKS workflow can consume for web-only rollouts.

## AWS deployment workflows

The AWS side is modeled in `src/move37/infra/eks` and currently has three release paths:

- OIDC bootstrap
- EKS access role
- main EKS stack

Related workflows:

- `deploy-oidc-bootstrap.yml`
- `deploy-eks-access-role.yml`
- `deploy-eks.yml`

Tag pattern examples:

- `cdk-stack-oidc-1.2.3-b.1`
- `cdk-stack-eks-access-1.2.3-b.1`
- `cdk-stack-eks-1.2.3-b.1`

Environment mapping in the workflows currently follows this convention:

- `-b.N` -> dev
- `-a.N` -> beta
- `-rc.N` -> rc
- bare semantic version -> prod

## Repo bootstrap tooling

`devtools/` is separate from application runtime. It is used to inspect and apply desired GitHub repository settings.

Typical commands:

```bash
devtools/bin/mv37-devtools doctor
devtools/bin/mv37-devtools repo plan
devtools/bin/mv37-devtools repo apply
devtools/bin/mv37-devtools infra doctor
devtools/bin/mv37-devtools infra bootstrap
devtools/bin/mv37-devtools infra deploy eks
```

Requirements:

- Docker on the host
- `gh` on the host
- successful `gh auth`
- AWS credentials for `infra *` commands, either via env vars or `~/.aws`

The wrapper uses your host `gh auth token` for repo/bootstrap commands and passes AWS environment through for infra commands before running the actual tooling inside a container.

## What contributors usually need to know

- Most code changes only need to satisfy the CI workflow and local validation.
- Release tags are meaningful and should be treated deliberately.
- Infra release tags and app release tags are different families.
- The EKS deployment model is driven by the CDK app in `src/move37/infra/eks`, not by Compose.
