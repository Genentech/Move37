#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Move37EksStack } from "../lib/move37-eks-stack";
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

const deploymentMetadata = resolveDeploymentMetadata(env.region, "eks");
const stackName = stackNameWithEnvironment("move37-eks", deploymentMetadata.environment);
const stack = new Move37EksStack(app, "Move37EksStack", {
  env,
  stackName,
});
applyStandardTags(stack, stackName, deploymentMetadata);
