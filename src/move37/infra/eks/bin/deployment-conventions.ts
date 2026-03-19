import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import * as cdk from "aws-cdk-lib";
import {
  MissingStackVersionError,
  StackVersionFileNotFoundError,
  StackVersionFileParseError,
} from "../lib/utils/deployment-errors";

export type DeploymentEnvironment = "dev" | "beta" | "rc" | "prod";
export type StackTarget = "eks" | "oidc" | "access";

const STACK_VERSION_FILE_PATH = resolvePath(process.cwd(), "stack-version.yaml");

const STACK_TARGET_LABELS: Record<StackTarget, string> = {
  eks: "move37-eks",
  oidc: "move37-github-oidc-bootstrap",
  access: "move37-eks-access-role",
};

export interface DeploymentMetadata {
  stackTarget: StackTarget;
  stackVersion: string;
  environment: DeploymentEnvironment;
  commitSha: string;
  gitRef: string;
  branch: string;
  repository: string;
  sourceUrl: string;
  workflowRunUrl: string;
  region: string;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function runGit(command: string): string | undefined {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function normalizeRepositorySlug(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (sshMatch) {
    return sshMatch[1];
  }

  return undefined;
}

function resolveRepository(): string {
  return (
    firstNonEmpty(
      process.env.GITHUB_REPOSITORY,
      normalizeRepositorySlug(runGit("git remote get-url origin") ?? ""),
    ) ?? "unknown"
  );
}

function resolveBranch(): string {
  const explicitBranch = firstNonEmpty(process.env.MOVE37_DEPLOY_BRANCH);
  if (explicitBranch) {
    return explicitBranch;
  }

  const githubHeadRef = firstNonEmpty(process.env.GITHUB_HEAD_REF);
  if (githubHeadRef) {
    return githubHeadRef;
  }

  const githubRef = firstNonEmpty(process.env.GITHUB_REF);
  if (githubRef?.startsWith("refs/heads/")) {
    return githubRef.replace("refs/heads/", "");
  }

  const localBranch = firstNonEmpty(
    runGit("git branch --show-current"),
    runGit("git rev-parse --abbrev-ref HEAD"),
  );
  if (localBranch && localBranch !== "HEAD") {
    return localBranch;
  }

  return "unknown";
}

function resolveEnvironmentFromBranch(branch: string): DeploymentEnvironment {
  if (branch === "dev" || branch === "feature" || branch.startsWith("feature/")) {
    return "dev";
  }
  if (branch === "beta") {
    return "beta";
  }
  if (branch === "rc") {
    return "rc";
  }
  if (branch === "stable") {
    return "prod";
  }
  return "dev";
}

function resolveEnvironment(branch: string): DeploymentEnvironment {
  const explicit = firstNonEmpty(process.env.MOVE37_DEPLOY_ENV)?.toLowerCase();
  if (explicit === "dev" || explicit === "beta" || explicit === "rc" || explicit === "prod") {
    return explicit;
  }
  if (explicit === "stable") {
    return "prod";
  }
  return resolveEnvironmentFromBranch(branch);
}

function parseStackVersionFile(): Record<string, string> {
  if (!existsSync(STACK_VERSION_FILE_PATH)) {
    throw new StackVersionFileNotFoundError(STACK_VERSION_FILE_PATH);
  }

  const raw = readFileSync(STACK_VERSION_FILE_PATH, "utf8");
  const entries = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf(":");
        if (index === -1) {
          throw new StackVersionFileParseError(
            STACK_VERSION_FILE_PATH,
            `Invalid line '${line}'`,
          );
        }
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );

  if (Object.keys(entries).length === 0) {
    throw new StackVersionFileParseError(
      STACK_VERSION_FILE_PATH,
      "No stack versions found",
    );
  }

  return entries;
}

export function resolveDeploymentMetadata(
  region: string,
  stackTarget: StackTarget,
): DeploymentMetadata {
  const versions = parseStackVersionFile();
  const stackVersion = versions[stackTarget];
  if (!stackVersion) {
    throw new MissingStackVersionError(STACK_VERSION_FILE_PATH, stackTarget);
  }

  const repository = resolveRepository();
  const branch = resolveBranch();
  const environment = resolveEnvironment(branch);
  const commitSha = firstNonEmpty(process.env.GITHUB_SHA, runGit("git rev-parse HEAD")) ?? "unknown";
  const gitRef =
    firstNonEmpty(process.env.GITHUB_REF, runGit("git symbolic-ref -q HEAD")) ?? "unknown";
  const sourceUrl =
    repository === "unknown" ? "unknown" : `https://github.com/${repository}/tree/${commitSha}`;
  const workflowRunUrl =
    repository === "unknown" ||
    !process.env.GITHUB_RUN_ID ||
    !process.env.GITHUB_SERVER_URL
      ? "unknown"
      : `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  return {
    stackTarget,
    stackVersion,
    environment,
    commitSha,
    gitRef,
    branch,
    repository,
    sourceUrl,
    workflowRunUrl,
    region,
  };
}

export function stackNameWithEnvironment(
  baseName: string,
  environment: DeploymentEnvironment,
): string {
  return `${baseName}-${environment}`;
}

export function applyStandardTags(stack: cdk.Stack, stackName: string, meta: DeploymentMetadata): void {
  cdk.Tags.of(stack).add("Name", stackName);
  cdk.Tags.of(stack).add("move37:stack-target", STACK_TARGET_LABELS[meta.stackTarget]);
  cdk.Tags.of(stack).add("move37:stack-version", meta.stackVersion);
  cdk.Tags.of(stack).add("move37:environment", meta.environment);
  cdk.Tags.of(stack).add("move37:repository", meta.repository);
  cdk.Tags.of(stack).add("move37:git-ref", meta.gitRef);
  cdk.Tags.of(stack).add("move37:commit-sha", meta.commitSha);
  cdk.Tags.of(stack).add("move37:region", meta.region);
}
