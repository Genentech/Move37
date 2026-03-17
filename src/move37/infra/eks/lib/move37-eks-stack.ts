import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import { KubectlV29Layer } from "@aws-cdk/lambda-layer-kubectl-v29";
import { Construct } from "constructs";

export class Move37EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = process.env.VPC_ID?.trim();
    if (!vpcId) {
      throw new Error("Missing required VPC_ID environment variable.");
    }

    const clusterSubnetIdsRaw = process.env.EKS_CLUSTER_SUBNET_IDS?.trim();
    if (!clusterSubnetIdsRaw) {
      throw new Error("Missing required EKS_CLUSTER_SUBNET_IDS environment variable.");
    }

    const clusterSubnetIds = Array.from(
      new Set(
        clusterSubnetIdsRaw
          .split(",")
          .map((subnetId) => subnetId.trim())
          .filter((subnetId) => subnetId.length > 0),
      ),
    );
    if (clusterSubnetIds.length < 2) {
      throw new Error("EKS_CLUSTER_SUBNET_IDS must include at least two subnet IDs.");
    }

    const invalidSubnetIds = clusterSubnetIds.filter((subnetId) => !subnetId.startsWith("subnet-"));
    if (invalidSubnetIds.length > 0) {
      throw new Error(
        `EKS_CLUSTER_SUBNET_IDS includes invalid subnet IDs: ${invalidSubnetIds.join(", ")}`,
      );
    }

    const deployEnvRaw = process.env.MOVE37_DEPLOY_ENV?.trim().toLowerCase();
    const deployEnv =
      deployEnvRaw === "stable"
        ? "prod"
        : deployEnvRaw === "dev" ||
            deployEnvRaw === "beta" ||
            deployEnvRaw === "rc" ||
            deployEnvRaw === "prod"
          ? deployEnvRaw
          : "dev";
    const clusterName =
      process.env.MOVE37_CLUSTER_NAME?.trim() || `move37-eks-${deployEnv}`;

    const namespace = new cdk.CfnParameter(this, "Namespace", {
      type: "String",
      default: "move37",
      description: "Kubernetes namespace for move37 workloads.",
    });

    const apiImage = new cdk.CfnParameter(this, "ApiImage", {
      type: "String",
      default: "ghcr.io/owner/move37-api:latest",
      description: "Container image for the API service.",
    });

    const webImage = new cdk.CfnParameter(this, "WebImage", {
      type: "String",
      default: "ghcr.io/owner/move37-web:latest",
      description: "Container image for the web service.",
    });

    const dbImage = new cdk.CfnParameter(this, "DbImage", {
      type: "String",
      default: "ghcr.io/owner/move37-db:latest",
      description: "Container image for the database service.",
    });

    const webStandaloneDebug = new cdk.CfnParameter(this, "WebStandaloneDebug", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
      description: "Enable standalone web mode without API proxying.",
    });

    const ghcrPullSecretName = new cdk.CfnParameter(this, "GhcrPullSecretName", {
      type: "String",
      default: "ghcr-pull-secret",
      description: "Kubernetes secret name for GHCR auth.",
    });

    const ghcrPullUsername = new cdk.CfnParameter(this, "GhcrPullUsername", {
      type: "String",
      default:
        process.env.EKS_GHCR_PULL_USERNAME?.trim() ?? process.env.GHCR_PULL_USERNAME?.trim() ?? "",
      description: "GitHub username used for GHCR image pulls.",
    });

    const ghcrPullToken = new cdk.CfnParameter(this, "GhcrPullToken", {
      type: "String",
      default:
        process.env.EKS_GHCR_PULL_TOKEN?.trim() ?? process.env.GHCR_PULL_TOKEN?.trim() ?? "",
      noEcho: true,
      description: "GitHub token with read:packages for GHCR image pulls.",
    });

    const dbUser = new cdk.CfnParameter(this, "DbUser", {
      type: "String",
      default: "move37",
      description: "POSTGRES_USER for the db service.",
    });

    const dbPassword = new cdk.CfnParameter(this, "DbPassword", {
      type: "String",
      default: "move37",
      noEcho: true,
      description: "POSTGRES_PASSWORD for the db service.",
    });

    const dbName = new cdk.CfnParameter(this, "DbName", {
      type: "String",
      default: "move37",
      description: "POSTGRES_DB for the db service.",
    });

    const dbStorage = new cdk.CfnParameter(this, "DbStorage", {
      type: "String",
      default: "20Gi",
      description: "Persistent volume size for Postgres.",
    });

    const apiBearerToken = new cdk.CfnParameter(this, "ApiBearerToken", {
      type: "String",
      default: "move37-dev-token",
      noEcho: true,
      description: "MOVE37_API_BEARER_TOKEN for the API service.",
    });

    const apiBearerSubject = new cdk.CfnParameter(this, "ApiBearerSubject", {
      type: "String",
      default: "local-user",
      description: "MOVE37_API_BEARER_SUBJECT for the API service.",
    });

    const otelEnabled = new cdk.CfnParameter(this, "OtelEnabled", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
      description: "Whether OTEL exporters are enabled in the API.",
    });

    const otelServiceName = new cdk.CfnParameter(this, "OtelServiceName", {
      type: "String",
      default: "move37-api",
      description: "OTEL service name exposed by the API.",
    });

    const otelExporterOtlpEndpoint = new cdk.CfnParameter(this, "OtelExporterOtlpEndpoint", {
      type: "String",
      default: "http://otel-collector:4318",
      description: "OTLP HTTP endpoint used by the API service.",
    });

    const otelMetricsExportIntervalMs = new cdk.CfnParameter(
      this,
      "OtelMetricsExportIntervalMs",
      {
        type: "String",
        default: "5000",
        description: "OTEL metrics export interval for the API service.",
      },
    );

    const grafanaAdminUser = new cdk.CfnParameter(this, "GrafanaAdminUser", {
      type: "String",
      default: "admin",
      description: "Grafana admin username.",
    });

    const grafanaAdminPassword = new cdk.CfnParameter(this, "GrafanaAdminPassword", {
      type: "String",
      default: "admin",
      noEcho: true,
      description: "Grafana admin password.",
    });

    const prometheusStorage = new cdk.CfnParameter(this, "PrometheusStorage", {
      type: "String",
      default: "20Gi",
      description: "Persistent volume size for Prometheus.",
    });

    const lokiStorage = new cdk.CfnParameter(this, "LokiStorage", {
      type: "String",
      default: "20Gi",
      description: "Persistent volume size for Loki.",
    });

    const grafanaStorage = new cdk.CfnParameter(this, "GrafanaStorage", {
      type: "String",
      default: "10Gi",
      description: "Persistent volume size for Grafana.",
    });

    const otelCollectorImage = new cdk.CfnParameter(this, "OtelCollectorImage", {
      type: "String",
      default: "otel/opentelemetry-collector-contrib:0.107.0",
      description: "Container image for the OTEL collector.",
    });

    const prometheusImage = new cdk.CfnParameter(this, "PrometheusImage", {
      type: "String",
      default: "prom/prometheus:v2.54.1",
      description: "Container image for Prometheus.",
    });

    const lokiImage = new cdk.CfnParameter(this, "LokiImage", {
      type: "String",
      default: "grafana/loki:2.9.10",
      description: "Container image for Loki.",
    });

    const promtailImage = new cdk.CfnParameter(this, "PromtailImage", {
      type: "String",
      default: "grafana/promtail:2.9.10",
      description: "Container image for Promtail.",
    });

    const grafanaImage = new cdk.CfnParameter(this, "GrafanaImage", {
      type: "String",
      default: "grafana/grafana:11.1.4",
      description: "Container image for Grafana.",
    });

    const vpc = ec2.Vpc.fromLookup(this, "Move37Vpc", { vpcId });
    const clusterSubnets = clusterSubnetIds.map((subnetId, index) =>
      ec2.Subnet.fromSubnetId(this, `Move37ClusterSubnet${index + 1}`, subnetId),
    );

    const cluster = new eks.Cluster(this, "Move37Cluster", {
      clusterName,
      version: eks.KubernetesVersion.V1_29,
      vpc,
      vpcSubnets: [{ subnets: clusterSubnets }],
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.LARGE,
      ),
      authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP,
      endpointAccess: eks.EndpointAccess.PUBLIC,
      placeClusterHandlerInVpc: false,
      kubectlLayer: new KubectlV29Layer(this, "KubectlLayer"),
    });

    const namespaceManifest = cluster.addManifest("Namespace", {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: namespace.valueAsString },
    });

    const ghcrPullSecretManifest = cluster.addManifest("GhcrPullSecret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: ghcrPullSecretName.valueAsString,
        namespace: namespace.valueAsString,
      },
      type: "kubernetes.io/dockerconfigjson",
      stringData: {
        ".dockerconfigjson": cdk.Fn.join("", [
          '{"auths":{"ghcr.io":{"username":"',
          ghcrPullUsername.valueAsString,
          '","password":"',
          ghcrPullToken.valueAsString,
          '"}}}',
        ]),
      },
    });
    ghcrPullSecretManifest.node.addDependency(namespaceManifest);

    const dbSecretManifest = cluster.addManifest("DbSecret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "db-secret",
        namespace: namespace.valueAsString,
      },
      type: "Opaque",
      stringData: {
        POSTGRES_USER: dbUser.valueAsString,
        POSTGRES_PASSWORD: dbPassword.valueAsString,
        POSTGRES_DB: dbName.valueAsString,
      },
    });
    dbSecretManifest.node.addDependency(namespaceManifest);

    const apiSecretManifest = cluster.addManifest("ApiSecret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "api-secret",
        namespace: namespace.valueAsString,
      },
      type: "Opaque",
      stringData: {
        MOVE37_API_BEARER_TOKEN: apiBearerToken.valueAsString,
        MOVE37_API_BEARER_SUBJECT: apiBearerSubject.valueAsString,
        OTEL_ENABLED: otelEnabled.valueAsString,
        OTEL_SERVICE_NAME: otelServiceName.valueAsString,
        OTEL_EXPORTER_OTLP_ENDPOINT: otelExporterOtlpEndpoint.valueAsString,
        OTEL_METRICS_EXPORT_INTERVAL_MS: otelMetricsExportIntervalMs.valueAsString,
      },
    });
    apiSecretManifest.node.addDependency(namespaceManifest);

    const grafanaSecretManifest = cluster.addManifest("GrafanaSecret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "grafana-secret",
        namespace: namespace.valueAsString,
      },
      type: "Opaque",
      stringData: {
        GF_SECURITY_ADMIN_USER: grafanaAdminUser.valueAsString,
        GF_SECURITY_ADMIN_PASSWORD: grafanaAdminPassword.valueAsString,
      },
    });
    grafanaSecretManifest.node.addDependency(namespaceManifest);

    const otelCollectorConfigMap = cluster.addManifest("OtelCollectorConfig", {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "otel-collector-config",
        namespace: namespace.valueAsString,
      },
      data: {
        "config.yaml": readRepoFile("../../../otel/otel-collector-config.yaml"),
      },
    });
    otelCollectorConfigMap.node.addDependency(namespaceManifest);

    const prometheusConfigMap = cluster.addManifest("PrometheusConfig", {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "prometheus-config",
        namespace: namespace.valueAsString,
      },
      data: {
        "prometheus.yml": readRepoFile("../../../prometheus/prometheus.yml"),
      },
    });
    prometheusConfigMap.node.addDependency(namespaceManifest);

    const lokiConfigMap = cluster.addManifest("LokiConfig", {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "loki-config",
        namespace: namespace.valueAsString,
      },
      data: {
        "local-config.yaml": readRepoFile("../../../loki/loki-config.yaml"),
      },
    });
    lokiConfigMap.node.addDependency(namespaceManifest);

    const grafanaDatasourcesConfigMap = cluster.addManifest("GrafanaDatasourcesConfig", {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "grafana-datasources",
        namespace: namespace.valueAsString,
      },
      data: {
        "datasources.yml": readRepoFile(
          "../../../grafana/provisioning/datasources/datasources.yml",
        ),
      },
    });
    grafanaDatasourcesConfigMap.node.addDependency(namespaceManifest);

    const promtailConfigMap = cluster.addManifest("PromtailConfig", {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "promtail-config",
        namespace: namespace.valueAsString,
      },
      data: {
        "config.yml": buildPromtailConfig(),
      },
    });
    promtailConfigMap.node.addDependency(namespaceManifest);

    const prometheusPvc = cluster.addManifest("PrometheusPvc", {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: "prometheus-data",
        namespace: namespace.valueAsString,
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: {
          requests: {
            storage: prometheusStorage.valueAsString,
          },
        },
      },
    });
    prometheusPvc.node.addDependency(namespaceManifest);

    const lokiPvc = cluster.addManifest("LokiPvc", {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: "loki-data",
        namespace: namespace.valueAsString,
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: {
          requests: {
            storage: lokiStorage.valueAsString,
          },
        },
      },
    });
    lokiPvc.node.addDependency(namespaceManifest);

    const grafanaPvc = cluster.addManifest("GrafanaPvc", {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: "grafana-data",
        namespace: namespace.valueAsString,
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: {
          requests: {
            storage: grafanaStorage.valueAsString,
          },
        },
      },
    });
    grafanaPvc.node.addDependency(namespaceManifest);

    const dbManifest = cluster.addManifest(
      "DbWorkload",
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "db",
          namespace: namespace.valueAsString,
          labels: { app: "db" },
        },
        spec: {
          selector: { app: "db" },
          ports: [{ name: "postgres", port: 5432, targetPort: 5432 }],
        },
      },
      {
        apiVersion: "apps/v1",
        kind: "StatefulSet",
        metadata: {
          name: "db",
          namespace: namespace.valueAsString,
          labels: { app: "db" },
        },
        spec: {
          serviceName: "db",
          replicas: 1,
          selector: { matchLabels: { app: "db" } },
          template: {
            metadata: { labels: { app: "db" } },
            spec: {
              imagePullSecrets: [{ name: ghcrPullSecretName.valueAsString }],
              containers: [
                {
                  name: "db",
                  image: dbImage.valueAsString,
                  ports: [{ containerPort: 5432, name: "postgres" }],
                  envFrom: [{ secretRef: { name: "db-secret" } }],
                  readinessProbe: {
                    exec: {
                      command: ["sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""],
                    },
                    initialDelaySeconds: 10,
                    periodSeconds: 5,
                    timeoutSeconds: 5,
                    failureThreshold: 6,
                  },
                  livenessProbe: {
                    exec: {
                      command: ["sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""],
                    },
                    initialDelaySeconds: 20,
                    periodSeconds: 10,
                    timeoutSeconds: 5,
                    failureThreshold: 6,
                  },
                  volumeMounts: [{ name: "data", mountPath: "/var/lib/postgresql/data" }],
                },
              ],
            },
          },
          volumeClaimTemplates: [
            {
              metadata: { name: "data" },
              spec: {
                accessModes: ["ReadWriteOnce"],
                resources: {
                  requests: {
                    storage: dbStorage.valueAsString,
                  },
                },
              },
            },
          ],
        },
      },
    );
    dbManifest.node.addDependency(namespaceManifest);
    dbManifest.node.addDependency(dbSecretManifest);
    dbManifest.node.addDependency(ghcrPullSecretManifest);

    const apiManifest = cluster.addManifest(
      "ApiWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "api",
          namespace: namespace.valueAsString,
          labels: { app: "api" },
        },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: "api" } },
          template: {
            metadata: { labels: { app: "api" } },
            spec: {
              imagePullSecrets: [{ name: ghcrPullSecretName.valueAsString }],
              initContainers: [
                {
                  name: "wait-for-db",
                  image: "public.ecr.aws/docker/library/busybox:1.36",
                  command: ["sh", "-c", "until nc -z db 5432; do echo waiting for db; sleep 2; done"],
                },
              ],
              containers: [
                {
                  name: "api",
                  image: apiImage.valueAsString,
                  ports: [{ containerPort: 8080, name: "http" }],
                  env: [
                    envFromSecret("POSTGRES_USER", "db-secret"),
                    envFromSecret("POSTGRES_PASSWORD", "db-secret"),
                    envFromSecret("POSTGRES_DB", "db-secret"),
                    {
                      name: "MOVE37_DATABASE_URL",
                      value:
                        "postgresql+psycopg://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@db:5432/$(POSTGRES_DB)",
                    },
                    envFromSecret("MOVE37_API_BEARER_TOKEN", "api-secret"),
                    envFromSecret("MOVE37_API_BEARER_SUBJECT", "api-secret"),
                    envFromSecret("OTEL_ENABLED", "api-secret"),
                    envFromSecret("OTEL_SERVICE_NAME", "api-secret"),
                    envFromSecret("OTEL_EXPORTER_OTLP_ENDPOINT", "api-secret"),
                    envFromSecret("OTEL_METRICS_EXPORT_INTERVAL_MS", "api-secret"),
                  ],
                  readinessProbe: {
                    httpGet: {
                      path: "/health",
                      port: 8080,
                    },
                    initialDelaySeconds: 10,
                    periodSeconds: 5,
                  },
                  livenessProbe: {
                    httpGet: {
                      path: "/health",
                      port: 8080,
                    },
                    initialDelaySeconds: 20,
                    periodSeconds: 10,
                  },
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "api",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "api" },
          ports: [{ name: "http", protocol: "TCP", port: 8080, targetPort: 8080 }],
        },
      },
    );
    apiManifest.node.addDependency(namespaceManifest);
    apiManifest.node.addDependency(dbManifest);
    apiManifest.node.addDependency(dbSecretManifest);
    apiManifest.node.addDependency(apiSecretManifest);
    apiManifest.node.addDependency(ghcrPullSecretManifest);

    const webManifest = cluster.addManifest(
      "WebWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "web",
          namespace: namespace.valueAsString,
          labels: { app: "web" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "web" } },
          template: {
            metadata: { labels: { app: "web" } },
            spec: {
              imagePullSecrets: [{ name: ghcrPullSecretName.valueAsString }],
              containers: [
                {
                  name: "web",
                  image: webImage.valueAsString,
                  ports: [{ containerPort: 80, name: "http" }],
                  env: [
                    {
                      name: "WEB_STANDALONE_DEBUG",
                      value: webStandaloneDebug.valueAsString,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "web",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "web" },
          ports: [{ name: "http", protocol: "TCP", port: 80, targetPort: 80 }],
        },
      },
    );
    webManifest.node.addDependency(namespaceManifest);
    webManifest.node.addDependency(apiManifest);
    webManifest.node.addDependency(ghcrPullSecretManifest);

    const otelCollectorManifest = cluster.addManifest(
      "OtelCollectorWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "otel-collector",
          namespace: namespace.valueAsString,
          labels: { app: "otel-collector" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "otel-collector" } },
          template: {
            metadata: { labels: { app: "otel-collector" } },
            spec: {
              containers: [
                {
                  name: "otel-collector",
                  image: otelCollectorImage.valueAsString,
                  args: ["--config=/etc/otelcol-contrib/config.yaml"],
                  ports: [
                    { containerPort: 4317, name: "otlp-grpc" },
                    { containerPort: 4318, name: "otlp-http" },
                    { containerPort: 9464, name: "metrics" },
                  ],
                  volumeMounts: [
                    {
                      name: "config",
                      mountPath: "/etc/otelcol-contrib/config.yaml",
                      subPath: "config.yaml",
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: "config",
                  configMap: {
                    name: "otel-collector-config",
                  },
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "otel-collector",
          namespace: namespace.valueAsString,
        },
        spec: {
          selector: { app: "otel-collector" },
          ports: [
            { name: "otlp-grpc", port: 4317, targetPort: 4317 },
            { name: "otlp-http", port: 4318, targetPort: 4318 },
            { name: "metrics", port: 9464, targetPort: 9464 },
          ],
        },
      },
    );
    otelCollectorManifest.node.addDependency(namespaceManifest);
    otelCollectorManifest.node.addDependency(otelCollectorConfigMap);

    const prometheusManifest = cluster.addManifest(
      "PrometheusWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "prometheus",
          namespace: namespace.valueAsString,
          labels: { app: "prometheus" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "prometheus" } },
          template: {
            metadata: { labels: { app: "prometheus" } },
            spec: {
              containers: [
                {
                  name: "prometheus",
                  image: prometheusImage.valueAsString,
                  args: [
                    "--config.file=/etc/prometheus/prometheus.yml",
                    "--storage.tsdb.path=/prometheus",
                    "--web.enable-lifecycle",
                  ],
                  ports: [{ containerPort: 9090, name: "http" }],
                  volumeMounts: [
                    {
                      name: "config",
                      mountPath: "/etc/prometheus/prometheus.yml",
                      subPath: "prometheus.yml",
                    },
                    {
                      name: "data",
                      mountPath: "/prometheus",
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: "config",
                  configMap: { name: "prometheus-config" },
                },
                {
                  name: "data",
                  persistentVolumeClaim: { claimName: "prometheus-data" },
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "prometheus",
          namespace: namespace.valueAsString,
        },
        spec: {
          selector: { app: "prometheus" },
          ports: [{ name: "http", port: 9090, targetPort: 9090 }],
        },
      },
    );
    prometheusManifest.node.addDependency(namespaceManifest);
    prometheusManifest.node.addDependency(prometheusConfigMap);
    prometheusManifest.node.addDependency(prometheusPvc);
    prometheusManifest.node.addDependency(otelCollectorManifest);

    const lokiManifest = cluster.addManifest(
      "LokiWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "loki",
          namespace: namespace.valueAsString,
          labels: { app: "loki" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "loki" } },
          template: {
            metadata: { labels: { app: "loki" } },
            spec: {
              containers: [
                {
                  name: "loki",
                  image: lokiImage.valueAsString,
                  args: ["-config.file=/etc/loki/local-config.yaml"],
                  ports: [{ containerPort: 3100, name: "http" }],
                  volumeMounts: [
                    {
                      name: "config",
                      mountPath: "/etc/loki/local-config.yaml",
                      subPath: "local-config.yaml",
                    },
                    {
                      name: "data",
                      mountPath: "/loki",
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: "config",
                  configMap: { name: "loki-config" },
                },
                {
                  name: "data",
                  persistentVolumeClaim: { claimName: "loki-data" },
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "loki",
          namespace: namespace.valueAsString,
        },
        spec: {
          selector: { app: "loki" },
          ports: [{ name: "http", port: 3100, targetPort: 3100 }],
        },
      },
    );
    lokiManifest.node.addDependency(namespaceManifest);
    lokiManifest.node.addDependency(lokiConfigMap);
    lokiManifest.node.addDependency(lokiPvc);

    const promtailAccessManifest = cluster.addManifest(
      "PromtailAccess",
      {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
          name: "promtail",
          namespace: namespace.valueAsString,
        },
      },
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRole",
        metadata: {
          name: `${clusterName}-promtail`,
        },
        rules: [
          {
            apiGroups: [""],
            resources: ["nodes", "pods", "services", "namespaces"],
            verbs: ["get", "list", "watch"],
          },
        ],
      },
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "ClusterRoleBinding",
        metadata: {
          name: `${clusterName}-promtail`,
        },
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name: `${clusterName}-promtail`,
        },
        subjects: [
          {
            kind: "ServiceAccount",
            name: "promtail",
            namespace: namespace.valueAsString,
          },
        ],
      },
    );
    promtailAccessManifest.node.addDependency(namespaceManifest);

    const promtailManifest = cluster.addManifest("PromtailWorkload", {
      apiVersion: "apps/v1",
      kind: "DaemonSet",
      metadata: {
        name: "promtail",
        namespace: namespace.valueAsString,
        labels: { app: "promtail" },
      },
      spec: {
        selector: { matchLabels: { app: "promtail" } },
        template: {
          metadata: { labels: { app: "promtail" } },
          spec: {
            serviceAccountName: "promtail",
            containers: [
              {
                name: "promtail",
                image: promtailImage.valueAsString,
                args: ["-config.file=/etc/promtail/config.yml"],
                ports: [{ containerPort: 9080, name: "http" }],
                volumeMounts: [
                  {
                    name: "config",
                    mountPath: "/etc/promtail/config.yml",
                    subPath: "config.yml",
                  },
                  {
                    name: "positions",
                    mountPath: "/tmp",
                  },
                  {
                    name: "pods",
                    mountPath: "/var/log/pods",
                    readOnly: true,
                  },
                  {
                    name: "containers",
                    mountPath: "/var/log/containers",
                    readOnly: true,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "config",
                configMap: { name: "promtail-config" },
              },
              {
                name: "positions",
                emptyDir: {},
              },
              {
                name: "pods",
                hostPath: {
                  path: "/var/log/pods",
                },
              },
              {
                name: "containers",
                hostPath: {
                  path: "/var/log/containers",
                },
              },
            ],
          },
        },
      },
    });
    promtailManifest.node.addDependency(namespaceManifest);
    promtailManifest.node.addDependency(promtailConfigMap);
    promtailManifest.node.addDependency(promtailAccessManifest);
    promtailManifest.node.addDependency(lokiManifest);

    const grafanaManifest = cluster.addManifest(
      "GrafanaWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "grafana",
          namespace: namespace.valueAsString,
          labels: { app: "grafana" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "grafana" } },
          template: {
            metadata: { labels: { app: "grafana" } },
            spec: {
              containers: [
                {
                  name: "grafana",
                  image: grafanaImage.valueAsString,
                  ports: [{ containerPort: 3000, name: "http" }],
                  env: [
                    envFromSecret("GF_SECURITY_ADMIN_USER", "grafana-secret"),
                    envFromSecret("GF_SECURITY_ADMIN_PASSWORD", "grafana-secret"),
                    { name: "GF_USERS_ALLOW_SIGN_UP", value: "false" },
                  ],
                  volumeMounts: [
                    {
                      name: "datasources",
                      mountPath: "/etc/grafana/provisioning/datasources/datasources.yml",
                      subPath: "datasources.yml",
                    },
                    {
                      name: "data",
                      mountPath: "/var/lib/grafana",
                    },
                  ],
                },
              ],
              volumes: [
                {
                  name: "datasources",
                  configMap: { name: "grafana-datasources" },
                },
                {
                  name: "data",
                  persistentVolumeClaim: { claimName: "grafana-data" },
                },
              ],
            },
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "grafana",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "grafana" },
          ports: [{ name: "http", port: 3000, targetPort: 3000 }],
        },
      },
    );
    grafanaManifest.node.addDependency(namespaceManifest);
    grafanaManifest.node.addDependency(grafanaSecretManifest);
    grafanaManifest.node.addDependency(grafanaDatasourcesConfigMap);
    grafanaManifest.node.addDependency(grafanaPvc);
    grafanaManifest.node.addDependency(prometheusManifest);
    grafanaManifest.node.addDependency(lokiManifest);

    new cdk.CfnOutput(this, "EksClusterName", {
      value: cluster.clusterName,
      description: "Name of the EKS cluster.",
    });

    new cdk.CfnOutput(this, "KubernetesNamespace", {
      value: namespace.valueAsString,
      description: "Namespace where move37 services are deployed.",
    });
  }
}

function envFromSecret(
  envName: string,
  secretName: string,
  secretKey?: string,
): { name: string; valueFrom: { secretKeyRef: { name: string; key: string } } } {
  return {
    name: envName,
    valueFrom: {
      secretKeyRef: {
        name: secretName,
        key: secretKey ?? envName,
      },
    },
  };
}

function readRepoFile(relativePathFromLib: string): string {
  return readFileSync(resolvePath(__dirname, relativePathFromLib), "utf8");
}

function buildPromtailConfig(): string {
  return [
    "server:",
    "  http_listen_port: 9080",
    "  grpc_listen_port: 0",
    "",
    "positions:",
    "  filename: /tmp/positions.yaml",
    "",
    "clients:",
    "  - url: http://loki:3100/loki/api/v1/push",
    "",
    "scrape_configs:",
    "  - job_name: kubernetes-pods",
    "    kubernetes_sd_configs:",
    "      - role: pod",
    "    pipeline_stages:",
    "      - cri: {}",
    "    relabel_configs:",
    "      - action: labelmap",
    "        regex: __meta_kubernetes_pod_label_(.+)",
    "      - action: replace",
    "        source_labels: [__meta_kubernetes_namespace]",
    "        target_label: namespace",
    "      - action: replace",
    "        source_labels: [__meta_kubernetes_pod_name]",
    "        target_label: pod",
    "      - action: replace",
    "        source_labels: [__meta_kubernetes_pod_container_name]",
    "        target_label: container",
    "      - action: replace",
    "        source_labels: [__meta_kubernetes_pod_uid, __meta_kubernetes_pod_container_name]",
    "        separator: /",
    "        replacement: /var/log/pods/*$1/*.log",
    "        target_label: __path__",
  ].join("\n");
}
