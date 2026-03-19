---
sidebar_position: 7
title: GitOps Strategy
description: Recommended branch promotion and release-tag strategy for Move37.
---

## Recommendation

Use a promotion-branch model:

- `feature/*` -> `dev`
- `dev` -> `beta`
- `beta` -> `rc`
- `rc` -> `stable`

Use tags, not branch pushes, to trigger container and infra releases.

My opinion: this is a good strategy for Move37 if the long-lived branches are treated as promotion stages, not parallel product lines. The repo already has tag-driven container and CDK release workflows, and the existing suffix mapping (`-b.N`, `-a.N`, `-rc.N`, bare semver) fits this model cleanly.

## Why This Fits Move37

The current repo already assumes:

- CI is separate from release automation
- application containers are published from version tags
- AWS/CDK deployments are published from separate `cdk-stack-*` tags
- prerelease suffixes map naturally to `dev`, `beta`, `rc`, and production

That means the missing piece is not a new release mechanism. The missing piece is a clear branch promotion policy around the tag mechanism.

## Opinionated Rules

### Branch roles

- `feature/*`: short-lived work branches
- `dev`: integration branch for ongoing work
- `beta`: promotion branch for wider testing
- `rc`: release-candidate branch for final verification
- `stable`: production branch and default branch

### Merge flow

- feature work opens PRs into `dev`
- only promotion PRs move code from `dev` to `beta`, `beta` to `rc`, and `rc` to `stable`
- do not cherry-pick between promotion branches except for exceptional hotfix handling
- do not commit directly to `dev`, `beta`, `rc`, or `stable`

### Release tags

Cut tags only from the matching promotion branch:

- `dev`:
  - `vX.Y.Z-b.N`
  - `cdk-stack-oidc-X.Y.Z-b.N`
  - `cdk-stack-eks-access-X.Y.Z-b.N`
  - `cdk-stack-eks-X.Y.Z-b.N`
- `beta`:
  - `vX.Y.Z-a.N`
  - `cdk-stack-oidc-X.Y.Z-a.N`
  - `cdk-stack-eks-access-X.Y.Z-a.N`
  - `cdk-stack-eks-X.Y.Z-a.N`
- `rc`:
  - `vX.Y.Z-rc.N`
  - `cdk-stack-oidc-X.Y.Z-rc.N`
  - `cdk-stack-eks-access-X.Y.Z-rc.N`
  - `cdk-stack-eks-X.Y.Z-rc.N`
- `stable`:
  - `vX.Y.Z`
  - `cdk-stack-oidc-X.Y.Z`
  - `cdk-stack-eks-access-X.Y.Z`
  - `cdk-stack-eks-X.Y.Z`

## Merge Method Opinion

I would not use squash-only merges for the whole repository if you adopt promotion branches.

Reason:

- squash merges are good for `feature/*` -> `dev`
- squash merges are bad for `dev` -> `beta` -> `rc` -> `stable` because they destroy promotion ancestry

Recommended merge settings:

- allow `squash merge`
- allow `merge commit`
- disable `rebase merge`

Recommended usage:

- use squash merge for feature PRs into `dev`
- use merge commits for promotion PRs between long-lived branches

## Branch Protection Opinion

Recommended baseline:

- `stable`
  - default branch
  - direct pushes blocked
  - force pushes blocked
  - deletions blocked
  - required PR reviews: 2
  - required checks: all contributor CI checks
- `rc`
  - direct pushes blocked
  - force pushes blocked
  - deletions blocked
  - required PR reviews: 2
  - required checks: all contributor CI checks
- `beta`
  - direct pushes blocked
  - force pushes blocked
  - deletions blocked
  - required PR reviews: 1
  - required checks: all contributor CI checks
- `dev`
  - direct pushes blocked
  - force pushes blocked
  - deletions blocked
  - required PR reviews: 1
  - required checks: all contributor CI checks

Recommended contributor CI checks to require:

- `python`
- `sdk`
- `web`
- `contributor-docs`

## Hotfix Opinion

If production hotfixes are common, use:

- `hotfix/*` branches from `stable`
- merge the hotfix back forward through `rc`, `beta`, and `dev`
- cut the production tag from `stable`

If production hotfixes are rare, keep the process simpler and handle them as exception-driven PRs.

## Default Branch Opinion

If you adopt this strategy fully, the default branch should be `stable`, not `main`.

That is the clearest signal that:

- `stable` is the source of truth for production
- promotion continues toward `stable`
- bare production tags belong on `stable`

## Implementation Notes

The repository should enforce this strategy in automation, not just by convention:

- `stable` is the default branch
- branch-triggered workflows use `stable`, not `main`
- production rollout metadata uses `stable`, not `latest`
- repo bootstrap tooling manages `dev`, `beta`, `rc`, and `stable`
- branch rulesets differ by promotion stage instead of using a single default-branch policy

## Final Opinion

I would use this strategy for Move37 with one important constraint:

- keep tags as the release trigger
- keep branches as promotion stages
- do not let long-lived branches become independent lines of development

If that discipline will hold, this is a strong fit.

If the team is likely to skip promotions, cherry-pick often, or merge features directly into multiple long-lived branches, a simpler `feature/* -> stable` plus environment tags strategy would be safer.
