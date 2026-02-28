# Penroselamarck EKS Release Deployment

This folder contains the AWS CDK app that deploys the EKS cluster and Kubernetes workloads for Penroselamarck.

## How the Cluster Gets Updated on New Container Releases

There are now two deployment paths.

### Path A: Infra/Full Release Tag (`cdk-stack-eks-*`)

1. A Git tag is pushed (for example `cdk-stack-eks-1.2.3`, `cdk-stack-eks-1.2.3-rc.1`, `cdk-stack-eks-1.2.3-a.1`, `cdk-stack-eks-1.2.3-b.1`).
2. `.github/workflows/deploy-eks.yml` runs on that tag (`push` trigger).
3. The workflow derives:
   - `image_tag` from the git tag by removing the `cdk-stack-eks-` prefix (example: `cdk-stack-eks-1.2.3` -> `1.2.3`)
   - deployment target (`dev`, `beta`, `rc`, `prod`)
   - cluster/namespace naming for the target environment
4. The workflow runs `cdk deploy`.
5. CloudFormation updates EKS manifests, and Kubernetes performs rolling updates.

### Path B: Web Release Tag (`v*`) -> Auto EKS Web Rollout

1. A web release tag is pushed (for example `v1.2.3`, `v1.2.3-b.1`, `v1.2.3-a.1`, `v1.2.3-rc.1`).
2. `.github/workflows/deploy-web.yml` builds `src/penroselamarck/web/Dockerfile` and pushes:
   - `ghcr.io/<owner>/penrose-lamarck-web:<image_tag>`
   - and `:latest` only for stable tags (`vX.Y.Z`)
3. `deploy-web.yml` publishes `deploy-web-metadata.json` as artifact with:
   - `image_tag`
   - `target_branch` (`dev`, `beta`, `rc`, `latest`)
4. `.github/workflows/deploy-eks.yml` is triggered by `workflow_run` after `Deploy Web Container` succeeds.
5. `deploy-eks.yml` downloads that artifact, maps target to environment/namespace, and runs:
   - `cdk deploy ... --parameters Namespace=<env-namespace> --parameters WebImage=ghcr.io/<owner>/penrose-lamarck-web:<image_tag>`
6. Result: only the web image parameter is updated, and EKS rolls out the new web pods for that environment.

Notes:
- This gives a direct web release path without requiring a `cdk-stack-eks-*` tag.
- Infra tags still remain the canonical path for full stack rollout changes.

## Troubleshooting OIDC for `Deploy EKS`

If `Deploy EKS` fails at `Configure AWS credentials` with:
`Not authorized to perform sts:AssumeRoleWithWebIdentity`

check the trust policy of `AWS_DEPLOY_ROLE_ARN` from the OIDC bootstrap stack.

For web rollouts, `.github/workflows/deploy-eks.yml` runs from `workflow_run` after
`Deploy Web Container`, so the OIDC token subject uses branch refs (for example
`repo:genentech/penrose-lamarck:ref:refs/heads/dev`), not only tag refs.

Required trust coverage:
- release tags: `refs/tags/v*`
- infra tags: `refs/tags/cdk-stack-*`
- deploy branches for workflow-run path: `refs/heads/dev`, `refs/heads/beta`,
  `refs/heads/rc`, `refs/heads/latest`

If this is missing:
1. Update `src/penroselamarck/infra/eks/lib/penroselamarck-github-oidc-bootstrap-stack.ts` trust subjects.
2. Push a new `cdk-stack-oidc-*` tag.
3. Wait for `Deploy OIDC Bootstrap` to succeed.
4. Re-run the failed `Deploy EKS` workflow.

## Release Commands

Use annotated tags and push the tag to trigger workflows.

### Web-Only Rollout (GHCR + Auto EKS Web Update)

Development:

```bash
git tag -a v1.2.3-b.1 -m "web dev release v1.2.3-b.1"
git push origin v1.2.3-b.1
```

Beta:

```bash
git tag -a v1.2.3-a.1 -m "web beta release v1.2.3-a.1"
git push origin v1.2.3-a.1
```

Release Candidate:

```bash
git tag -a v1.2.3-rc.1 -m "web rc release v1.2.3-rc.1"
git push origin v1.2.3-rc.1
```

Production:

```bash
git tag -a v1.2.3 -m "web prod release v1.2.3"
git push origin v1.2.3
```

### Full Infra/Stack Rollout (EKS CDK Deploy Path)

Development:

```bash
git tag -a cdk-stack-eks-1.2.3-b.1 -m "eks dev stack release 1.2.3-b.1"
git push origin cdk-stack-eks-1.2.3-b.1
```

Beta:

```bash
git tag -a cdk-stack-eks-1.2.3-a.1 -m "eks beta stack release 1.2.3-a.1"
git push origin cdk-stack-eks-1.2.3-a.1
```

Release Candidate:

```bash
git tag -a cdk-stack-eks-1.2.3-rc.1 -m "eks rc stack release 1.2.3-rc.1"
git push origin cdk-stack-eks-1.2.3-rc.1
```

Production:

```bash
git tag -a cdk-stack-eks-1.2.3 -m "eks prod stack release 1.2.3"
git push origin cdk-stack-eks-1.2.3
```

## Standalone Web Debug Mode (No API Dependency)

`WebStandaloneDebug` lets EKS run the web container without proxying `/v1` calls to `api`.

Behavior:

- `WebStandaloneDebug=false` (default):
  - `/v1/*` is proxied to `penroselamarck-api:8080`
- `WebStandaloneDebug=true`:
  - web serves local stub responses for `/v1/*`
  - no upstream API connection is attempted from the web container

Container implementation:

- Runtime switch script: `src/penroselamarck/web/docker-entrypoint/40-web-mode.sh`
- Nginx configs:
  - proxy mode: `src/penroselamarck/web/nginx.proxy.conf`
  - standalone mode: `src/penroselamarck/web/nginx.standalone.conf`
- The `40-` prefix is used so nginx entrypoint executes the script in deterministic lexical order.

How to enable in GitHub Actions (recommended):

1. Set repository variable `WEB_STANDALONE_DEBUG` to `true`.
2. Trigger release/deploy tag as usual.
3. Workflow passes `--parameters WebStandaloneDebug=true` to CDK deploy.

How to enable locally:

```bash
cd src/penroselamarck/infra/eks
cp .env.example .env
# set WEB_STANDALONE_DEBUG=true in .env if using with-env defaults
PENROSELAMARCK_DEPLOY_ENV=dev npm run deploy -- PenroselamarckEksStack --require-approval never --parameters Namespace=penroselamarck-dev --parameters WebStandaloneDebug=true
```

## Verify Rollout

After a release workflow completes, verify the `web` rollout in the target cluster/namespace.

Select target:

```bash
# dev | beta | rc | prod
export ENV=dev
```

Resolve cluster/namespace:

```bash
case "$ENV" in
  dev)  export CLUSTER=penroselamarck-eks-dev;  export NS=penroselamarck-dev ;;
  beta) export CLUSTER=penroselamarck-eks-beta; export NS=penroselamarck-beta ;;
  rc)   export CLUSTER=penroselamarck-eks-rc;   export NS=penroselamarck-rc ;;
  prod) export CLUSTER=penroselamarck-eks-prod; export NS=penroselamarck-prod ;;
  *) echo "Unsupported ENV: $ENV" >&2; exit 1 ;;
esac
```

Update kubeconfig and verify deployment:

```bash
aws eks update-kubeconfig --name "$CLUSTER" --region "$AWS_REGION"
kubectl -n "$NS" get deploy web
kubectl -n "$NS" rollout status deploy/web --timeout=5m
kubectl -n "$NS" get pods -l app=web -o wide
```

Confirm running image tag:

```bash
kubectl -n "$NS" get deploy web -o=jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

## Compose Services and EKS Mapping

Services currently in `compose.yml`:

- `docs`
- `api`
- `web`
- `orchestrator`
- `mcp-inspector`
- `mcp-fastapi`
- `db`
- `marquez-db`
- `marquez`
- `marquez-web`

EKS stack coverage:

- Deployed by CDK: `docs`, `api`, `web`, `mcp-inspector`, `mcp-fastapi`, `db`, `marquez-db`, `marquez`, `marquez-web`
- Not currently deployed in the EKS stack: `orchestrator`

Release image updates handled directly by the workflow:

- `ApiImage` -> `ghcr.io/<owner>/penrose-lamarck-api:<image_tag>`
- `WebImage` -> `ghcr.io/<owner>/penrose-lamarck-web:<image_tag>`
- `DbImage` -> `ghcr.io/<owner>/penrose-lamarck-pg:<image_tag>`
- `DocsImage` -> `ghcr.io/<owner>/penrose-lamarck-docs:<image_tag>`

If you need additional release-driven image updates (`mcp-inspector`, `mcp-fastapi`, `marquez`, `marquez-web`), add the related CDK parameters in the workflow deploy step.

## Local CDK Commands

```bash
cd src/penroselamarck/infra/eks
cp .env.example .env
npm install
# edit stack-version.yaml
npm run synth
PENROSELAMARCK_DEPLOY_ENV=dev npm run deploy -- PenroselamarckEksStack --require-approval never --parameters Namespace=penroselamarck-dev
```

## Stack Naming and Tags

Stack names follow kebab-case and always include the environment suffix:

- EKS stack: `penroselamarck-eks-{env}`
- GitHub OIDC bootstrap stack: `penroselamarck-github-oidc-bootstrap-{env}`

Environment inference:

- `feature/*` -> `dev`
- `dev` -> `dev`
- `beta` -> `beta`
- `rc` -> `rc`
- `stable` -> `prod`
- fallback (unknown branch) -> `dev`

Stack version source and optional overrides:

- Required per stack:
  - `stack-version.yaml` must exist in `src/penroselamarck/infra/eks`
  - it must define both stack keys:
    - `eks: <version>`
    - `oidc: <version>`
- If the file is missing, malformed, or a stack key is missing, synth/deploy fails fast with an explicit error.
- Optional:
  - `PENROSELAMARCK_DEPLOY_ENV`: force environment (`dev`, `beta`, `rc`, `prod`, or `stable` mapped to `prod`)
  - `PENROSELAMARCK_DEPLOY_BRANCH`: force branch used for inference
  - `PENROSELAMARCK_PR_URL`: set PR URL explicitly (recommended for tag-triggered workflows)

Every stack/resource gets standard tags for discoverability and traceability:

- `penroselamarck:environment`
- `penroselamarck:stack-name`
- `penroselamarck:stack-target`
- `penroselamarck:stack-version`
- `penroselamarck:version`
- `penroselamarck:git-commit`
- `penroselamarck:git-ref`
- `penroselamarck:git-branch`
- `penroselamarck:repository`
- `penroselamarck:source-url` (commit-pinned repo URL to `infra/eks`)
- `penroselamarck:pr-url`
- `penroselamarck:workflow-run-url`
- `penroselamarck:stack-url`
- `penroselamarck:managed-by` (`cdk`)

## Infra Deployment Tags (Protected)

Infra stack deploy tags must follow this format:

- `cdk-stack-{stack}-{version}`

Examples:

- `cdk-stack-eks-1.0.1-b.1`
- `cdk-stack-iam-1.0.1-b.1`
- `cdk-stack-s3-1.0.1-b.1`
- `cdk-stack-rds-1.0.1-b.1`

Where:

- `{stack}` is one of: `eks`, `iam`, `s3`, `rds`
- `{version}` is semver-compatible and may include prerelease/build suffixes (for example `1.0.1-b.1`)

### Protected Tags

Configure GitHub protected tag rules (or rulesets) for deploy-triggering tags:

- Protect pattern: `cdk-stack-*`
- Restrict create/update/delete to approved maintainers or deployment bot only
- Disallow force-retagging deploy tags (tag should remain immutable)
- Prefer annotated/signed tags for stronger provenance

This ensures only authorized actors can trigger infra deployments and that each deployment tag remains auditable.

## EKS Endpoint Access Mode

The stack currently sets:

- `endpointAccess: eks.EndpointAccess.PUBLIC`

Reason: this avoids attaching the CDK kubectl provider Lambda (`Handler886CB40B`) to VPC subnets in restricted accounts where ENI creation may be blocked (`ec2:CreateNetworkInterface`).

Security note:

- `PUBLIC` exposes the Kubernetes API endpoint publicly, but IAM auth still applies.
- Restrict endpoint CIDRs as a follow-up hardening step.

## Recovering from Failed Deploys

If the stack ends in `ROLLBACK_COMPLETE`, redeploy will fail until the failed stack is deleted.

Use:

```bash
aws cloudformation delete-stack --region "$AWS_REGION" --stack-name penroselamarck-eks-dev
aws cloudformation wait stack-delete-complete --region "$AWS_REGION" --stack-name penroselamarck-eks-dev
PENROSELAMARCK_DEPLOY_ENV=dev npm run deploy -- PenroselamarckEksStack --require-approval never --parameters Namespace=penroselamarck-dev
```

## One-Time AWS Setup (Bootstrap + GitHub OIDC Deploy Role)

Run this once per AWS account/region:

```bash
cd src/penroselamarck/infra/eks
cp .env.example .env
npm install
npm run bootstrap
# edit stack-version.yaml
npm run deploy:oidc-bootstrap
```

`npm run bootstrap` creates the CDK toolkit stack and SSM version parameter required by `cdk deploy`.

After the stack deploys, copy output `AwsDeployRoleArn` and set it in repository secret `AWS_DEPLOY_ROLE_ARN`.

## Local Environment Variables

Create `src/penroselamarck/infra/eks/.env` from `.env.example` and set:

- `AWS_ACCESS_KEY_ID`: AWS access key id (required for raw/session credentials)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key (required for raw/session credentials)
- `AWS_SESSION_TOKEN`: AWS session token (required for temporary credentials)
- `AWS_REGION`: target AWS region
- `VPC_ID`: existing VPC id used by the EKS stack (required). The stack does not create VPC/IGW/EIP resources.
- `AWS_PROFILE` (optional): alternative to raw keys, local AWS profile to use
- `AWS_ACCOUNT_ID` (optional): only needed if you want to pin account explicitly

## Required GitHub Configuration

Workflow expected configuration:

- Secret: `AWS_DEPLOY_ROLE_ARN` (OIDC-assumable IAM role for deploy)
- Variable: `AWS_REGION` (optional, defaults to `eu-central-1`)
- Variable: `VPC_ID` (required existing VPC id for EKS deployment)
- Variable: `WEB_STANDALONE_DEBUG` (optional, `false` by default; set `true` for standalone web debug mode)
