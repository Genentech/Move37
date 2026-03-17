import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class Move37GithubOidcBootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubOrg = new cdk.CfnParameter(this, "GitHubOrg", {
      type: "String",
      default: process.env.GITHUB_REPOSITORY_OWNER?.trim() || "pereid22",
      description: "GitHub organization or user that owns the repository.",
    });

    const githubRepository = new cdk.CfnParameter(this, "GitHubRepository", {
      type: "String",
      default: "mv37",
      description: "GitHub repository name.",
    });

    const githubReleaseRefPattern = new cdk.CfnParameter(this, "GitHubReleaseRefPattern", {
      type: "String",
      default: "refs/tags/v*",
      description: "Git ref pattern for release tags allowed to assume the role.",
    });

    const githubInfraRefPattern = new cdk.CfnParameter(this, "GitHubInfraRefPattern", {
      type: "String",
      default: "refs/tags/cdk-stack-*",
      description: "Git ref pattern for infra tags allowed to assume the role.",
    });

    const githubDeployBranchRefs = [
      "refs/heads/dev",
      "refs/heads/beta",
      "refs/heads/rc",
      "refs/heads/latest",
    ];

    const deployRoleName = new cdk.CfnParameter(this, "DeployRoleName", {
      type: "String",
      default: "move37-github-deploy-role",
      description: "IAM role name used by GitHub Actions deploy workflows.",
    });

    const githubOidcProvider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

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
      description: "OIDC deploy role for GitHub Actions in the move37 repository.",
      assumedBy: new iam.FederatedPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
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
      description: "Set this as the GitHub secret AWS_DEPLOY_ROLE_ARN.",
    });

    new cdk.CfnOutput(this, "GitHubOidcProviderArn", {
      value: githubOidcProvider.openIdConnectProviderArn,
      description: "IAM OIDC provider used for GitHub Actions federation.",
    });
  }
}
