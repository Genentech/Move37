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
export type StackTarget = "eks" | "oidc";

const STACK_VERSION_FILE_NAME = "stack-version.yaml";
const STACK_VERSION_FILE_PATH = resolvePath(process.cwd(), STACK_VERSION_FILE_NAME);

const STACK_TARGET_LABELS: Record<StackTarget, string> = {
  eks: "penroselamarck-eks",
  oidc: "penroselamarck-github-oidc-bootstrap",
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
  prUrl: string;
  workflowRunUrl: string;
  region: string;
}

/**
 * Return the first non-empty value from a candidate list.
 *
 * :param values: Candidate string values to inspect in order.
 * :returns: The first trimmed non-empty value, or ``undefined`` when none exist.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const value = firstNonEmpty(undefined, "  ", "release-1");
 *      // value === "release-1"
 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Execute a git command and return trimmed stdout.
 *
 * :param command: Shell command to execute.
 * :returns: Trimmed stdout, or ``undefined`` if command execution fails.
 * :side effects:
 *   - Spawns a synchronous child process.
 * :raises: None (errors are swallowed and converted to ``undefined``).
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const sha = runGit("git rev-parse HEAD");
 */
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

/**
 * Convert a GitHub remote URL into an ``owner/repo`` slug.
 *
 * :param remoteUrl: Remote URL in HTTPS or SSH format.
 * :returns: Repository slug in ``owner/repo`` format, or ``undefined`` for unsupported URLs.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const slug = normalizeRepositorySlug("https://github.com/genentech/penrose-lamarck.git");
 *      // slug === "genentech/penrose-lamarck"
 */
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

/**
 * Resolve repository slug from environment or git remote.
 *
 * :returns: Repository slug (``owner/repo``) or ``"unknown"`` when unavailable.
 * :side effects:
 *   - Reads ``GITHUB_REPOSITORY`` from environment.
 *   - May execute ``git remote get-url origin``.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const repository = resolveRepository();
 */
function resolveRepository(): string {
  return (
    firstNonEmpty(
      process.env.GITHUB_REPOSITORY,
      normalizeRepositorySlug(runGit("git remote get-url origin") ?? ""),
    ) ?? "unknown"
  );
}

/**
 * Resolve the branch used for environment inference and tagging.
 *
 * :returns: Branch name or ``"unknown"`` when unavailable.
 * :side effects:
 *   - Reads branch-related environment variables.
 *   - May execute git branch inspection commands.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const branch = resolveBranch();
 */
function resolveBranch(): string {
  const explicitBranch = firstNonEmpty(process.env.PENROSELAMARCK_DEPLOY_BRANCH);
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

/**
 * Map branch name to deployment environment.
 *
 * :param branch: Source branch name.
 * :returns: Deployment environment derived from branch naming rules.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const env = resolveEnvironmentFromBranch("feature/my-change");
 *      // env === "dev"
 */
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

/**
 * Resolve deployment environment using explicit override and branch fallback.
 *
 * :param branch: Source branch name used for fallback inference.
 * :returns: Deployment environment.
 * :side effects:
 *   - Reads ``PENROSELAMARCK_DEPLOY_ENV`` from environment.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const env = resolveEnvironment("stable");
 *      // env === "prod"
 */
function resolveEnvironment(branch: string): DeploymentEnvironment {
  const explicit = firstNonEmpty(process.env.PENROSELAMARCK_DEPLOY_ENV)?.toLowerCase();
  if (explicit === "stable") {
    return "prod";
  }
  if (explicit === "dev" || explicit === "beta" || explicit === "rc" || explicit === "prod") {
    return explicit;
  }
  return resolveEnvironmentFromBranch(branch);
}

/**
 * Resolve git reference used for tagging.
 *
 * :returns: Full git ref (for example ``refs/heads/dev``) or ``"unknown"``.
 * :side effects:
 *   - Reads ``GITHUB_REF``.
 *   - May execute ``git symbolic-ref -q --short HEAD``.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const ref = resolveGitRef();
 */
function resolveGitRef(): string {
  const symbolicRef = runGit("git symbolic-ref -q --short HEAD");
  return (
    firstNonEmpty(
      process.env.GITHUB_REF,
      symbolicRef ? `refs/heads/${symbolicRef}` : undefined,
    ) ?? "unknown"
  );
}

/**
 * Resolve commit SHA for traceability tags.
 *
 * :returns: Commit SHA or ``"unknown"`` when unavailable.
 * :side effects:
 *   - Reads ``GITHUB_SHA``.
 *   - May execute ``git rev-parse HEAD``.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const sha = resolveCommitSha();
 */
function resolveCommitSha(): string {
  return firstNonEmpty(process.env.GITHUB_SHA, runGit("git rev-parse HEAD")) ?? "unknown";
}

/**
 * Determine whether a YAML key maps to a supported stack target.
 *
 * :param key: YAML key candidate.
 * :returns: ``true`` when the key is ``eks`` or ``oidc``.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const ok = isStackTargetKey("eks");
 */
function isStackTargetKey(key: string): key is StackTarget {
  return key === "eks" || key === "oidc";
}

/**
 * Remove YAML inline comments and optional surrounding quotes from a scalar value.
 *
 * :param rawValue: Raw scalar string after ``key:``.
 * :returns: Normalized scalar value.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const value = parseYamlScalarValue("\"v1.2.3\" # release");
 *      // value === "v1.2.3"
 */
function parseYamlScalarValue(rawValue: string): string {
  let value = rawValue.trim();
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let commentStart = -1;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === "\"" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      commentStart = index;
      break;
    }
  }

  if (commentStart >= 0) {
    value = value.slice(0, commentStart).trim();
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

/**
 * Read ``stack-version.yaml`` from disk.
 *
 * :param filePath: Absolute path to the stack version file.
 * :returns: Full file contents as UTF-8 text.
 * :side effects:
 *   - Reads from local filesystem.
 * :raises StackVersionFileNotFoundError:
 *   Raised when the file does not exist.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const content = readStackVersionFile("/repo/infra/eks/stack-version.yaml");
 */
function readStackVersionFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new StackVersionFileNotFoundError(filePath);
  }

  return readFileSync(filePath, "utf8");
}

/**
 * Parse ``stack-version.yaml`` into a stack-to-version map.
 *
 * :param filePath: Absolute path to the stack version file.
 * :returns: Parsed version map for supported stack targets.
 * :side effects:
 *   - Reads local file contents using ``readStackVersionFile``.
 * :raises StackVersionFileNotFoundError:
 *   Raised when file is absent.
 * :raises StackVersionFileParseError:
 *   Raised on invalid line format, unsupported keys, or empty values.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const versions = parseStackVersionFile("/repo/infra/eks/stack-version.yaml");
 */
function parseStackVersionFile(filePath: string): Partial<Record<StackTarget, string>> {
  const content = readStackVersionFile(filePath);
  const lines = content.split(/\r?\n/);
  const versions: Partial<Record<StackTarget, string>> = {};

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      throw new StackVersionFileParseError(
        filePath,
        lineNumber,
        "Expected 'key: value' format.",
      );
    }

    const key = match[1];
    if (!isStackTargetKey(key)) {
      throw new StackVersionFileParseError(
        filePath,
        lineNumber,
        `Unsupported key '${key}'. Supported keys: eks, oidc.`,
      );
    }

    const value = parseYamlScalarValue(match[2]);
    if (!value) {
      throw new StackVersionFileParseError(filePath, lineNumber, "Missing version value.");
    }

    versions[key] = value;
  });

  return versions;
}

/**
 * Resolve required stack version for a specific stack target from ``stack-version.yaml``.
 *
 * :param stackTarget: Stack selector (``"eks"`` or ``"oidc"``).
 * :returns: Stack version string from ``stack-version.yaml``.
 * :side effects:
 *   - Reads and parses ``stack-version.yaml`` from the current working directory.
 * :raises StackVersionFileNotFoundError:
 *   Raised when ``stack-version.yaml`` is missing.
 * :raises StackVersionFileParseError:
 *   Raised when file syntax or keys are invalid.
 * :raises MissingStackVersionError:
 *   Raised when the target key is absent in the file.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const version = resolveStackVersion("eks");
 */
function resolveStackVersion(stackTarget: StackTarget): string {
  const versions = parseStackVersionFile(STACK_VERSION_FILE_PATH);
  const stackVersion = firstNonEmpty(versions[stackTarget]);
  if (!stackVersion) {
    throw new MissingStackVersionError(
      STACK_TARGET_LABELS[stackTarget],
      stackTarget,
      STACK_VERSION_FILE_NAME,
    );
  }
  return stackVersion;
}

/**
 * Resolve pull-request URL for traceability tags.
 *
 * :param repository: Repository slug in ``owner/repo`` format.
 * :returns: PR URL or ``"none"`` when no PR context exists.
 * :side effects:
 *   - Reads PR-related environment variables.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const prUrl = resolvePrUrl("genentech/penrose-lamarck");
 */
function resolvePrUrl(repository: string): string {
  const explicit = firstNonEmpty(process.env.PENROSELAMARCK_PR_URL, process.env.GITHUB_PR_URL);
  if (explicit) {
    return explicit;
  }

  const githubRef = firstNonEmpty(process.env.GITHUB_REF) ?? "";
  const pullMatch = githubRef.match(/^refs\/pull\/(\d+)\/.*/);
  if (pullMatch && repository !== "unknown") {
    return `https://github.com/${repository}/pull/${pullMatch[1]}`;
  }

  return "none";
}

/**
 * Resolve GitHub Actions workflow run URL for traceability tags.
 *
 * :param repository: Repository slug in ``owner/repo`` format.
 * :returns: Workflow run URL or ``"none"`` when run metadata is unavailable.
 * :side effects:
 *   - Reads ``GITHUB_RUN_ID`` from environment.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const runUrl = resolveWorkflowRunUrl("genentech/penrose-lamarck");
 */
function resolveWorkflowRunUrl(repository: string): string {
  const runId = firstNonEmpty(process.env.GITHUB_RUN_ID);
  if (!runId || repository === "unknown") {
    return "none";
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

/**
 * Build a commit-pinned source URL pointing at the ``infra/eks`` directory.
 *
 * :param repository: Repository slug in ``owner/repo`` format.
 * :param commitSha: Git commit SHA.
 * :returns: Source URL or ``"none"`` when repository or SHA are unknown.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const url = resolveSourceUrl("genentech/penrose-lamarck", "abc123");
 */
function resolveSourceUrl(repository: string, commitSha: string): string {
  if (repository === "unknown" || commitSha === "unknown") {
    return "none";
  }
  return `https://github.com/${repository}/tree/${commitSha}/infra/eks`;
}

/**
 * Build the CloudFormation console URL for a stack.
 *
 * :param region: AWS region.
 * :param stackName: CloudFormation stack name.
 * :returns: CloudFormation console URL.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const url = buildStackUrl("eu-central-1", "penroselamarck-eks-dev");
 */
function buildStackUrl(region: string, stackName: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home/region/${region}/stacks/stackinfo/stackName/${stackName}`;
}

/**
 * Resolve complete deployment metadata for a specific stack target.
 *
 * :param region: AWS region used for console URL generation.
 * :param stackTarget: Stack selector (``"eks"`` or ``"oidc"``).
 * :returns: Deployment metadata consumed by naming and tagging helpers.
 * :side effects:
 *   - Reads ``stack-version.yaml`` from local filesystem.
 *   - Reads multiple environment variables.
 *   - May execute git commands to resolve branch, ref, SHA, and repository.
 * :raises StackVersionFileNotFoundError:
 *   Raised when ``stack-version.yaml`` is missing.
 * :raises StackVersionFileParseError:
 *   Raised when ``stack-version.yaml`` syntax is invalid.
 * :raises MissingStackVersionError:
 *   Raised when target key is missing in ``stack-version.yaml``.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const metadata = resolveDeploymentMetadata("eu-central-1", "oidc");
 */
export function resolveDeploymentMetadata(
  region: string,
  stackTarget: StackTarget,
): DeploymentMetadata {
  const branch = resolveBranch();
  const commitSha = resolveCommitSha();
  const gitRef = resolveGitRef();
  const repository = resolveRepository();

  return {
    stackTarget,
    stackVersion: resolveStackVersion(stackTarget),
    environment: resolveEnvironment(branch),
    commitSha,
    gitRef,
    branch,
    repository,
    sourceUrl: resolveSourceUrl(repository, commitSha),
    prUrl: resolvePrUrl(repository),
    workflowRunUrl: resolveWorkflowRunUrl(repository),
    region,
  };
}

/**
 * Build a stack name with environment suffix.
 *
 * :param baseName: Base stack name prefix.
 * :param environment: Deployment environment suffix.
 * :returns: Final stack name in ``{baseName}-{environment}`` format.
 * :side effects: None.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      const stackName = stackNameWithEnvironment("penroselamarck-eks", "dev");
 *      // stackName === "penroselamarck-eks-dev"
 */
export function stackNameWithEnvironment(
  baseName: string,
  environment: DeploymentEnvironment,
): string {
  return `${baseName}-${environment}`;
}

/**
 * Apply standard Penroselamarck tags to all resources in a stack.
 *
 * :param stack: CDK stack to tag.
 * :param stackName: Final stack name used in CloudFormation.
 * :param metadata: Deployment metadata values used to populate tags.
 * :returns: ``void``.
 * :side effects:
 *   - Mutates CDK tag state for the supplied stack and all taggable descendants.
 * :raises: None.
 *
 * :example:
 *   .. code-block:: ts
 *
 *      applyStandardTags(stack, "penroselamarck-eks-dev", metadata);
 */
export function applyStandardTags(
  stack: cdk.Stack,
  stackName: string,
  metadata: DeploymentMetadata,
): void {
  const tags: Record<string, string> = {
    "penroselamarck:managed-by": "cdk",
    "penroselamarck:stack-name": stackName,
    "penroselamarck:stack-target": metadata.stackTarget,
    "penroselamarck:stack-version": metadata.stackVersion,
    "penroselamarck:environment": metadata.environment,
    "penroselamarck:version": metadata.stackVersion,
    "penroselamarck:git-commit": metadata.commitSha,
    "penroselamarck:git-ref": metadata.gitRef,
    "penroselamarck:git-branch": metadata.branch,
    "penroselamarck:repository": metadata.repository,
    "penroselamarck:source-url": metadata.sourceUrl,
    "penroselamarck:pr-url": metadata.prUrl,
    "penroselamarck:workflow-run-url": metadata.workflowRunUrl,
    "penroselamarck:stack-url": buildStackUrl(metadata.region, stackName),
  };

  for (const [key, value] of Object.entries(tags)) {
    cdk.Tags.of(stack).add(key, value);
  }
}
