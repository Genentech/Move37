import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as eks from "aws-cdk-lib/aws-eks";
import { KubectlV29Layer } from "@aws-cdk/lambda-layer-kubectl-v29";
import { Construct } from "constructs";

/**
 * CDK stack that provisions Penroselamarck EKS infrastructure and workloads.
 *
 * :param scope: Parent construct.
 * :param id: Construct identifier.
 * :param props: Optional CDK stack properties.
 * :returns: Configured EKS stack instance.
 * :side effects:
 *   - Imports an existing VPC by ``VPC_ID`` and defines EKS cluster resources in it.
 *   - Defines Kubernetes manifests (Deployments, Services, StatefulSets, Secrets).
 *   - Adds CloudFormation outputs for cluster and namespace metadata.
 * :raises Error:
 *   Raised when ``VPC_ID`` is not provided in environment.
 *   Deployment-time failures may still occur in AWS/Kubernetes.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      new PenroselamarckEksStack(app, "PenroselamarckEksStack", {
 *        env: { account: "123456789012", region: "eu-central-1" },
 *        stackName: "penroselamarck-eks-dev",
 *      });
 */
export class PenroselamarckEksStack extends cdk.Stack {
  /**
   * Construct the Penroselamarck EKS stack.
   *
   * :param scope: Parent construct.
   * :param id: Construct identifier.
   * :param props: Optional CDK stack properties.
   * :returns: ``PenroselamarckEksStack``.
   * :side effects:
   *   - Reads ``VPC_ID`` from environment to locate an existing VPC.
   *   - Registers CloudFormation parameters for image and runtime configuration.
   *   - Defines EKS control plane and Kubernetes manifests.
   * :raises Error:
   *   Raised when ``VPC_ID`` is missing.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const stack = new PenroselamarckEksStack(app, "EksStack", {
   *        env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
   *      });
   */
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = process.env.VPC_ID?.trim();
    if (!vpcId) {
      throw new Error(
        "Missing required VPC_ID environment variable. The EKS stack deploys into an existing VPC and does not create networking infrastructure.",
      );
    }

    const deployEnvRaw = process.env.PENROSELAMARCK_DEPLOY_ENV?.trim().toLowerCase();
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
      process.env.PENROSELAMARCK_CLUSTER_NAME?.trim() || `penroselamarck-eks-${deployEnv}`;

    const namespace = new cdk.CfnParameter(this, "Namespace", {
      type: "String",
      default: "penroselamarck",
      description: "Kubernetes namespace for all workloads.",
    });

    const docsImage = new cdk.CfnParameter(this, "DocsImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-docs:latest",
      description: "Container image for the docs service.",
    });

    const apiImage = new cdk.CfnParameter(this, "ApiImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-api:1.0.0",
      description: "Container image for the api service.",
    });

    const webImage = new cdk.CfnParameter(this, "WebImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-web:1.0.0",
      description: "Container image for the web service.",
    });

    const webStandaloneDebug = new cdk.CfnParameter(this, "WebStandaloneDebug", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
      description:
        "Enable standalone web debug mode (web runs without proxying /v1 calls to api).",
    });

    const mcpInspectorImage = new cdk.CfnParameter(this, "McpInspectorImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-mcp-inspector:latest",
      description: "Container image for mcp-inspector.",
    });

    const mcpFastapiImage = new cdk.CfnParameter(this, "McpFastapiImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-mcp-fastapi:latest",
      description: "Container image for mcp-fastapi.",
    });

    const dbImage = new cdk.CfnParameter(this, "DbImage", {
      type: "String",
      default: "ghcr.io/genentech/penrose-lamarck-pg:1.0.0",
      description: "Container image for the db service.",
    });

    const marquezImage = new cdk.CfnParameter(this, "MarquezImage", {
      type: "String",
      default: "marquezproject/marquez:0.44.0",
      description: "Container image for marquez.",
    });

    const marquezWebImage = new cdk.CfnParameter(this, "MarquezWebImage", {
      type: "String",
      default: "marquezproject/marquez-web:0.44.0",
      description: "Container image for marquez-web.",
    });

    const dbUser = new cdk.CfnParameter(this, "DbUser", {
      type: "String",
      default: "penroselamarck",
      description: "POSTGRES_USER for db service.",
    });

    const dbPassword = new cdk.CfnParameter(this, "DbPassword", {
      type: "String",
      default: "penroselamarck",
      noEcho: true,
      description: "POSTGRES_PASSWORD for db service.",
    });

    const dbName = new cdk.CfnParameter(this, "DbName", {
      type: "String",
      default: "penroselamarck",
      description: "POSTGRES_DB for db service.",
    });

    const dbStorage = new cdk.CfnParameter(this, "DbStorage", {
      type: "String",
      default: "20Gi",
      description: "Persistent volume size for db StatefulSet.",
    });

    const marquezDbUser = new cdk.CfnParameter(this, "MarquezDbUser", {
      type: "String",
      default: "marquez",
      description: "POSTGRES_USER for marquez-db.",
    });

    const marquezDbPassword = new cdk.CfnParameter(this, "MarquezDbPassword", {
      type: "String",
      default: "marquez",
      noEcho: true,
      description: "POSTGRES_PASSWORD for marquez-db.",
    });

    const marquezDbName = new cdk.CfnParameter(this, "MarquezDbName", {
      type: "String",
      default: "marquez",
      description: "POSTGRES_DB for marquez-db.",
    });

    const marquezDbStorage = new cdk.CfnParameter(this, "MarquezDbStorage", {
      type: "String",
      default: "20Gi",
      description: "Persistent volume size for marquez-db StatefulSet.",
    });

    const auth0Domain = new cdk.CfnParameter(this, "Auth0Domain", {
      type: "String",
      default: "",
      description: "AUTH0_DOMAIN for api.",
    });

    const auth0Audience = new cdk.CfnParameter(this, "Auth0Audience", {
      type: "String",
      default: "",
      description: "AUTH0_AUDIENCE for api.",
    });

    const auth0Issuer = new cdk.CfnParameter(this, "Auth0Issuer", {
      type: "String",
      default: "",
      description: "AUTH0_ISSUER for api.",
    });

    const auth0JwksUrl = new cdk.CfnParameter(this, "Auth0JwksUrl", {
      type: "String",
      default: "",
      description: "AUTH0_JWKS_URL for api.",
    });

    const mcpResourceUrl = new cdk.CfnParameter(this, "McpResourceUrl", {
      type: "String",
      default: "",
      description: "MCP_RESOURCE_URL for api.",
    });

    const mcpOauthScopes = new cdk.CfnParameter(this, "McpOauthScopes", {
      type: "String",
      default: "",
      description: "MCP_OAUTH_SCOPES for api.",
    });

    const authDisabled = new cdk.CfnParameter(this, "AuthDisabled", {
      type: "String",
      default: "false",
      allowedValues: ["true", "false"],
      description: "AUTH_DISABLED for api.",
    });

    const githubToken = new cdk.CfnParameter(this, "GithubToken", {
      type: "String",
      default: "",
      noEcho: true,
      description: "GITHUB_TOKEN for api.",
    });

    const githubRepository = new cdk.CfnParameter(this, "GithubRepository", {
      type: "String",
      default: "",
      description: "GITHUB_REPOSITORY for api.",
    });

    const githubBaseBranch = new cdk.CfnParameter(this, "GithubBaseBranch", {
      type: "String",
      default: "main",
      description: "GITHUB_BASE_BRANCH for api.",
    });

    const githubApiUrl = new cdk.CfnParameter(this, "GithubApiUrl", {
      type: "String",
      default: "https://api.github.com",
      description: "GITHUB_API_URL for api.",
    });

    const githubManifestDir = new cdk.CfnParameter(this, "GithubManifestDir", {
      type: "String",
      default: "docs/sphinx/src/manifest",
      description: "GITHUB_MANIFEST_DIR for api.",
    });

    const vpc = ec2.Vpc.fromLookup(this, "PenroselamarckVpc", {
      vpcId,
    });

    const kubectlLayer = new KubectlV29Layer(this, "KubectlLayer");

    const cluster = new eks.Cluster(this, "PenroselamarckCluster", {
      clusterName,
      version: eks.KubernetesVersion.V1_29,
      vpc,
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(
        ec2.InstanceClass.M5,
        ec2.InstanceSize.LARGE,
      ),
      endpointAccess: eks.EndpointAccess.PUBLIC,
      placeClusterHandlerInVpc: false,
      kubectlLayer,
    });

    const namespaceManifest = cluster.addManifest("Namespace", {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: namespace.valueAsString },
    });

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
        AUTH0_DOMAIN: auth0Domain.valueAsString,
        AUTH0_AUDIENCE: auth0Audience.valueAsString,
        AUTH0_ISSUER: auth0Issuer.valueAsString,
        AUTH0_JWKS_URL: auth0JwksUrl.valueAsString,
        MCP_RESOURCE_URL: mcpResourceUrl.valueAsString,
        MCP_OAUTH_SCOPES: mcpOauthScopes.valueAsString,
        AUTH_DISABLED: authDisabled.valueAsString,
        GITHUB_TOKEN: githubToken.valueAsString,
        GITHUB_REPOSITORY: githubRepository.valueAsString,
        GITHUB_BASE_BRANCH: githubBaseBranch.valueAsString,
        GITHUB_API_URL: githubApiUrl.valueAsString,
        GITHUB_MANIFEST_DIR: githubManifestDir.valueAsString,
      },
    });
    apiSecretManifest.node.addDependency(namespaceManifest);

    const marquezDbSecretManifest = cluster.addManifest("MarquezDbSecret", {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "marquez-db-secret",
        namespace: namespace.valueAsString,
      },
      type: "Opaque",
      stringData: {
        POSTGRES_USER: marquezDbUser.valueAsString,
        POSTGRES_PASSWORD: marquezDbPassword.valueAsString,
        POSTGRES_DB: marquezDbName.valueAsString,
      },
    });
    marquezDbSecretManifest.node.addDependency(namespaceManifest);

    const docsManifest = cluster.addManifest(
      "DocsWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "docs",
          namespace: namespace.valueAsString,
          labels: { app: "docs" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "docs" } },
          template: {
            metadata: { labels: { app: "docs" } },
            spec: {
              containers: [
                {
                  name: "docs",
                  image: docsImage.valueAsString,
                  command: [
                    "sphinx-autobuild",
                    "/docs/src",
                    "/docs/build/html",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    "8000",
                  ],
                  ports: [{ containerPort: 8000 }],
                  env: [
                    { name: "PYTHONDONTWRITEBYTECODE", value: "1" },
                    { name: "PYTHONUNBUFFERED", value: "1" },
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
          name: "docs",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "docs" },
          ports: [{ name: "http", protocol: "TCP", port: 8000, targetPort: 8000 }],
        },
      },
    );
    docsManifest.node.addDependency(namespaceManifest);

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
              containers: [
                {
                  name: "db",
                  image: dbImage.valueAsString,
                  ports: [{ containerPort: 5432, name: "postgres" }],
                  envFrom: [{ secretRef: { name: "db-secret" } }],
                  env: [
                    { name: "OPENLINEAGE_URL", value: "http://marquez:5000" },
                    { name: "OPENLINEAGE_NAMESPACE", value: "penroselamarck" },
                  ],
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
                    { name: "PYTHONDONTWRITEBYTECODE", value: "1" },
                    { name: "PYTHONUNBUFFERED", value: "1" },
                    envFromSecret("POSTGRES_USER", "db-secret"),
                    envFromSecret("POSTGRES_PASSWORD", "db-secret"),
                    envFromSecret("POSTGRES_DB", "db-secret"),
                    {
                      name: "DATABASE_URL",
                      value: "postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@db:5432/$(POSTGRES_DB)",
                    },
                    envFromSecret("AUTH0_DOMAIN", "api-secret"),
                    envFromSecret("AUTH0_AUDIENCE", "api-secret"),
                    envFromSecret("AUTH0_ISSUER", "api-secret"),
                    envFromSecret("AUTH0_JWKS_URL", "api-secret"),
                    { name: "AUTH0_ALGORITHMS", value: "RS256" },
                    { name: "AUTH0_ROLES_CLAIM", value: "permissions" },
                    { name: "AUTH0_CLOCK_SKEW_SECONDS", value: "60" },
                    { name: "AUTH0_JWKS_CACHE_TTL_SECONDS", value: "600" },
                    { name: "AUTH0_JWKS_TIMEOUT_SECONDS", value: "5" },
                    envFromSecret("MCP_RESOURCE_URL", "api-secret"),
                    envFromSecret("MCP_OAUTH_SCOPES", "api-secret"),
                    envFromSecret("AUTH_DISABLED", "api-secret"),
                    envFromSecret("GITHUB_TOKEN", "api-secret"),
                    envFromSecret("GITHUB_REPOSITORY", "api-secret"),
                    envFromSecret("GITHUB_BASE_BRANCH", "api-secret"),
                    envFromSecret("GITHUB_API_URL", "api-secret"),
                    envFromSecret("GITHUB_MANIFEST_DIR", "api-secret"),
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
          ports: [{ name: "http", protocol: "TCP", port: 5173, targetPort: 80 }],
        },
      },
    );
    webManifest.node.addDependency(namespaceManifest);
    webManifest.node.addDependency(apiManifest);

    const mcpInspectorManifest = cluster.addManifest(
      "McpInspectorWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "mcp-inspector",
          namespace: namespace.valueAsString,
          labels: { app: "mcp-inspector" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "mcp-inspector" } },
          template: {
            metadata: { labels: { app: "mcp-inspector" } },
            spec: {
              containers: [
                {
                  name: "mcp-inspector",
                  image: mcpInspectorImage.valueAsString,
                  workingDir: "/workspace",
                  command: [
                    "sh",
                    "-c",
                    "npx --yes @modelcontextprotocol/inspector --config /workspace/tests/mcp/config.json --server penroselamarck",
                  ],
                  ports: [{ containerPort: 6274, name: "http" }],
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
          name: "mcp-inspector",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "mcp-inspector" },
          ports: [{ name: "http", protocol: "TCP", port: 6274, targetPort: 6274 }],
        },
      },
    );
    mcpInspectorManifest.node.addDependency(namespaceManifest);
    mcpInspectorManifest.node.addDependency(apiManifest);

    const mcpFastapiManifest = cluster.addManifest("McpFastapiWorkload", {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "mcp-fastapi",
        namespace: namespace.valueAsString,
        labels: { app: "mcp-fastapi" },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: "mcp-fastapi" } },
        template: {
          metadata: { labels: { app: "mcp-fastapi" } },
          spec: {
            containers: [
              {
                name: "mcp-fastapi",
                image: mcpFastapiImage.valueAsString,
                workingDir: "/workspace",
                command: [
                  "sh",
                  "-c",
                  "pip install -r tests/mcp/python-requirements.txt && python tests/mcp/fastmcp_client.py --sse-url http://api:8080/v1/mcp/sse",
                ],
                env: [
                  { name: "MCP_SSE_URL", value: "http://api:8080/v1/mcp/sse" },
                ],
              },
            ],
          },
        },
      },
    });
    mcpFastapiManifest.node.addDependency(namespaceManifest);
    mcpFastapiManifest.node.addDependency(apiManifest);

    const marquezDbManifest = cluster.addManifest(
      "MarquezDbWorkload",
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "marquez-db",
          namespace: namespace.valueAsString,
          labels: { app: "marquez-db" },
        },
        spec: {
          selector: { app: "marquez-db" },
          ports: [{ name: "postgres", port: 5432, targetPort: 5432 }],
        },
      },
      {
        apiVersion: "apps/v1",
        kind: "StatefulSet",
        metadata: {
          name: "marquez-db",
          namespace: namespace.valueAsString,
          labels: { app: "marquez-db" },
        },
        spec: {
          serviceName: "marquez-db",
          replicas: 1,
          selector: { matchLabels: { app: "marquez-db" } },
          template: {
            metadata: { labels: { app: "marquez-db" } },
            spec: {
              containers: [
                {
                  name: "marquez-db",
                  image: "postgres:15-alpine",
                  ports: [{ containerPort: 5432, name: "postgres" }],
                  envFrom: [{ secretRef: { name: "marquez-db-secret" } }],
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
                    storage: marquezDbStorage.valueAsString,
                  },
                },
              },
            },
          ],
        },
      },
    );
    marquezDbManifest.node.addDependency(namespaceManifest);
    marquezDbManifest.node.addDependency(marquezDbSecretManifest);

    const marquezManifest = cluster.addManifest(
      "MarquezWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "marquez",
          namespace: namespace.valueAsString,
          labels: { app: "marquez" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "marquez" } },
          template: {
            metadata: { labels: { app: "marquez" } },
            spec: {
              containers: [
                {
                  name: "marquez",
                  image: marquezImage.valueAsString,
                  ports: [{ containerPort: 5000, name: "http" }],
                  env: [
                    { name: "MARQUEZ_DB_HOST", value: "marquez-db" },
                    { name: "MARQUEZ_DB_PORT", value: "5432" },
                    envFromSecret("MARQUEZ_DB_USER", "marquez-db-secret", "POSTGRES_USER"),
                    envFromSecret("MARQUEZ_DB_PASSWORD", "marquez-db-secret", "POSTGRES_PASSWORD"),
                    envFromSecret("MARQUEZ_DB", "marquez-db-secret", "POSTGRES_DB"),
                    { name: "MARQUEZ_PORT", value: "5000" },
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
          name: "marquez",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "marquez" },
          ports: [{ name: "http", protocol: "TCP", port: 5000, targetPort: 5000 }],
        },
      },
    );
    marquezManifest.node.addDependency(namespaceManifest);
    marquezManifest.node.addDependency(marquezDbManifest);
    marquezManifest.node.addDependency(marquezDbSecretManifest);

    const marquezWebManifest = cluster.addManifest(
      "MarquezWebWorkload",
      {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
          name: "marquez-web",
          namespace: namespace.valueAsString,
          labels: { app: "marquez-web" },
        },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: "marquez-web" } },
          template: {
            metadata: { labels: { app: "marquez-web" } },
            spec: {
              containers: [
                {
                  name: "marquez-web",
                  image: marquezWebImage.valueAsString,
                  ports: [{ containerPort: 3000, name: "http" }],
                  env: [
                    { name: "MARQUEZ_HOST", value: "marquez" },
                    { name: "MARQUEZ_PORT", value: "5000" },
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
          name: "marquez-web",
          namespace: namespace.valueAsString,
        },
        spec: {
          type: "LoadBalancer",
          selector: { app: "marquez-web" },
          ports: [{ name: "http", protocol: "TCP", port: 3000, targetPort: 3000 }],
        },
      },
    );
    marquezWebManifest.node.addDependency(namespaceManifest);
    marquezWebManifest.node.addDependency(marquezManifest);

    new cdk.CfnOutput(this, "EksClusterName", {
      value: cluster.clusterName,
      description: "Name of the EKS cluster.",
    });

    new cdk.CfnOutput(this, "KubernetesNamespace", {
      value: namespace.valueAsString,
      description: "Namespace where penroselamarck services are deployed.",
    });
  }
}

/**
 * Build a Kubernetes ``env`` entry that references a key from a secret.
 *
 * :param envName: Container environment variable name.
 * :param secretName: Kubernetes secret name.
 * :param secretKey: Optional secret key name. Defaults to ``envName``.
 * :returns: Kubernetes ``env`` object for ``valueFrom.secretKeyRef``.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const envVar = envFromSecret("POSTGRES_USER", "db-secret");
 */
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
