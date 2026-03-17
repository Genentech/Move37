import * as cdk from "aws-cdk-lib";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface Move37EksAccessRoleStackProps extends cdk.StackProps {
  clusterNameDefault: string;
  accessRoleNameDefault: string;
}

export class Move37EksAccessRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Move37EksAccessRoleStackProps) {
    super(scope, id, props);

    const clusterName = new cdk.CfnParameter(this, "ClusterName", {
      type: "String",
      default: props.clusterNameDefault,
      description: "EKS cluster name that receives the shared kubectl access entry.",
    });

    const accessRoleName = new cdk.CfnParameter(this, "AccessRoleName", {
      type: "String",
      default: props.accessRoleNameDefault,
      description: "IAM role name used by team members to access kubectl on EKS.",
    });

    const principalArnLikePatterns = new cdk.CfnParameter(this, "PrincipalArnLikePatterns", {
      type: "CommaDelimitedList",
      default:
        "arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_*," +
        "arn:aws:sts::*:assumed-role/AWSReservedSSO_*/*," +
        "arn:aws:iam::*:role/team-*," +
        "arn:aws:sts::*:assumed-role/team-*/*",
      description:
        "Comma-delimited ARN-like patterns allowed to assume the shared EKS kubectl access role.",
    });

    const trustedPrincipal = new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID).withConditions({
      ArnLike: {
        "aws:PrincipalArn": principalArnLikePatterns.valueAsList,
      },
    });

    const accessRole = new iam.Role(this, "EksTeamKubectlAccessRole", {
      roleName: accessRoleName.valueAsString,
      description: "Shared role for team kubectl access to the move37 EKS cluster.",
      assumedBy: trustedPrincipal,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    accessRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "DescribeTargetEksCluster",
        actions: ["eks:DescribeCluster"],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: "eks",
            resource: "cluster",
            resourceName: clusterName.valueAsString,
          }),
        ],
      }),
    );

    const importedCluster = eks.Cluster.fromClusterAttributes(this, "ImportedEksCluster", {
      clusterName: clusterName.valueAsString,
    });

    const accessEntry = new eks.AccessEntry(this, "TeamKubectlAccessEntry", {
      cluster: importedCluster,
      principal: accessRole.roleArn,
      accessPolicies: [
        new eks.AccessPolicy({
          policy: eks.AccessPolicyArn.AMAZON_EKS_CLUSTER_ADMIN_POLICY,
          accessScope: {
            type: eks.AccessScopeType.CLUSTER,
          },
        }),
      ],
    });

    new cdk.CfnOutput(this, "TeamAccessRoleArn", {
      value: accessRole.roleArn,
      description: "Assume this role before running kubectl against the target EKS cluster.",
    });

    new cdk.CfnOutput(this, "TeamAccessEntryName", {
      value: accessEntry.accessEntryName,
      description: "EKS access entry associated with the shared team role.",
    });
  }
}
