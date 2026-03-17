# move37 EKS Deployment

This folder contains the AWS CDK app that deploys the `move37` EKS cluster and the workloads already modeled in [`/Users/pereid22/source/mv37/compose.yml`](/Users/pereid22/source/mv37/compose.yml).

The deployment model is adapted from `epicshelter`:

- GitHub OIDC bootstrap stack
- shared EKS access-role stack for `kubectl`
- main EKS stack for cluster and workloads
- GitHub Actions workflows that build release images and deploy tagged infra

## Workloads

The EKS stack deploys:

- `db`
- `api`
- `web`
- `otel-collector`
- `prometheus`
- `loki`
- `promtail`
- `grafana`

Differences from local Compose:

- `promtail` is Kubernetes-native and scrapes pod logs from node filesystems instead of Docker socket metadata
- config files for OTEL, Prometheus, Loki, and Grafana are turned into Kubernetes `ConfigMap`s
- persistent local volumes become Kubernetes PVCs

## Release Flows

Container release tags:

- `v1.2.3-b.1` -> dev image tags
- `v1.2.3-a.1` -> beta image tags
- `v1.2.3-rc.1` -> rc image tags
- `v1.2.3` -> prod image tags and `latest`

Infra release tags:

- `cdk-stack-oidc-1.2.3-b.1`
- `cdk-stack-eks-access-1.2.3-b.1`
- `cdk-stack-eks-1.2.3-b.1`

The EKS workflow also supports web-only rollouts by consuming the metadata artifact from `Deploy Web Container`.
