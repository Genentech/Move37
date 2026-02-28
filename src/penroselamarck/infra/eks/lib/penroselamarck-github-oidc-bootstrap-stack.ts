import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

/**
 * CDK stack that provisions GitHub OIDC federation and deploy role.
 *
 * :param scope: Parent construct.
 * :param id: Construct identifier.
 * :param props: Optional CDK stack properties.
 * :returns: Configured stack instance.
 * :side effects:
 *   - Defines IAM OIDC provider for ``token.actions.githubusercontent.com``.
 *   - Defines IAM role trusted for ``sts:AssumeRoleWithWebIdentity``.
 *   - Adds CloudFormation outputs for deploy role and OIDC provider ARNs.
 * :raises: None at construction time (deployment-time failures may still occur in AWS).
 *
 * :example:
 *   .. code-block:: ts
 *
 *      new PenroselamarckGithubOidcBootstrapStack(app, "PenroselamarckGithubOidcBootstrapStack", {
 *        env: { account: "123456789012", region: "eu-central-1" },
 *        stackName: "penroselamarck-github-oidc-bootstrap-dev",
 *      });
 */
export class PenroselamarckGithubOidcBootstrapStack extends cdk.Stack {
  /**
   * Construct the GitHub OIDC bootstrap stack.
   *
   * :param scope: Parent construct.
   * :param id: Construct identifier.
   * :param props: Optional CDK stack properties.
   * :returns: ``PenroselamarckGithubOidcBootstrapStack``.
   * :side effects:
   *   - Registers CloudFormation parameters for GitHub org/repo/ref and role name.
   *   - Defines IAM resources and CloudFormation outputs.
   * :raises: None at construction time.
   *
   * :example:
   *   .. code-block:: ts
   *
   *      const stack = new PenroselamarckGithubOidcBootstrapStack(app, "OidcStack", {
   *        env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
   *      });
   */
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubOrg = new cdk.CfnParameter(this, "GitHubOrg", {
      type: "String",
      default: "genentech",
      description: "GitHub organization or user that owns the repository.",
    });

    const githubRepository = new cdk.CfnParameter(this, "GitHubRepository", {
      type: "String",
      default: "penrose-lamarck",
      description: "GitHub repository name.",
    });

    const githubReleaseRefPattern = new cdk.CfnParameter(
      this,
      "GitHubReleaseRefPattern",
      {
        type: "String",
        default: "refs/tags/v*",
        description: "Git ref pattern for release tags allowed to assume the role.",
      },
    );

    const githubInfraRefPattern = new cdk.CfnParameter(
      this,
      "GitHubInfraRefPattern",
      {
        type: "String",
        default: "refs/tags/cdk-stack-*",
        description: "Git ref pattern for infra tags allowed to assume the role.",
      },
    );

    const githubDeployBranchRefs = [
      "refs/heads/dev",
      "refs/heads/beta",
      "refs/heads/rc",
      "refs/heads/latest",
    ];

    const deployRoleName = new cdk.CfnParameter(this, "DeployRoleName", {
      type: "String",
      default: "penroselamarck-github-deploy-role",
      description: "IAM role name used by GitHub Actions deploy workflow.",
    });

    const githubOidcProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubOidcProvider",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      },
    );

    const oidcProviderArn = githubOidcProvider.openIdConnectProviderArn;

    const oidcProviderHost = "token.actions.githubusercontent.com";
    const buildRepositorySubjectForRef = (refPattern: string): string =>
      cdk.Fn.join("", [
        "repo:",
        githubOrg.valueAsString,
        "/",
        githubRepository.valueAsString,
        ":ref:",
        refPattern,
      ]);

    const role = new iam.Role(this, "GitHubDeployRole", {
      roleName: deployRoleName.valueAsString,
      description:
        "OIDC deploy role for GitHub Actions in genentech/penrose-lamarck tags and deploy branches.",
      assumedBy: new iam.FederatedPrincipal(
        oidcProviderArn,
        {
          StringEquals: {
            [`${oidcProviderHost}:aud`]: "sts.amazonaws.com",
          },
          StringLike: {
            [`${oidcProviderHost}:sub`]: [
              buildRepositorySubjectForRef(githubReleaseRefPattern.valueAsString),
              buildRepositorySubjectForRef(githubInfraRefPattern.valueAsString),
              ...githubDeployBranchRefs.map((branchRef) =>
                buildRepositorySubjectForRef(branchRef),
              ),
            ],
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      maxSessionDuration: cdk.Duration.hours(1),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    new cdk.CfnOutput(this, "AwsDeployRoleArn", {
      value: role.roleArn,
      description:
        "Set this ARN as GitHub secret AWS_DEPLOY_ROLE_ARN in genentech/penrose-lamarck.",
    });

    new cdk.CfnOutput(this, "GitHubOidcProviderArn", {
      value: oidcProviderArn,
      description:
        "IAM OIDC provider used for GitHub Actions web identity federation.",
    });
  }
}
