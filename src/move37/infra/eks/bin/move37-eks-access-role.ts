#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Move37EksAccessRoleStack } from "../lib/move37-eks-access-role-stack";
import {
  applyStandardTags,
  resolveDeploymentMetadata,
  stackNameWithEnvironment,
} from "./deployment-conventions";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1",
};

const deploymentMetadata = resolveDeploymentMetadata(env.region, "access");
const stackName = stackNameWithEnvironment(
  "move37-eks-access-role",
  deploymentMetadata.environment,
);
const defaultClusterName = stackNameWithEnvironment("move37-eks", deploymentMetadata.environment);
const stack = new Move37EksAccessRoleStack(app, "Move37EksAccessRoleStack", {
  env,
  stackName,
  clusterNameDefault: defaultClusterName,
  accessRoleNameDefault: `${defaultClusterName}-kubectl`,
});
applyStandardTags(stack, stackName, deploymentMetadata);
