#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PenroselamarckEksStack } from "../lib/penroselamarck-eks-stack";
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

const eksStackName = stackNameWithEnvironment(
  "penroselamarck-eks",
  deploymentMetadata.environment,
);
const eksStack = new PenroselamarckEksStack(app, "PenroselamarckEksStack", {
  env,
  stackName: eksStackName,
});
applyStandardTags(eksStack, eksStackName, deploymentMetadata);
