#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Move37GithubOidcBootstrapStack } from "../lib/move37-github-oidc-bootstrap-stack";
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

const deploymentMetadata = resolveDeploymentMetadata(env.region, "oidc");
const stackName = stackNameWithEnvironment(
  "move37-github-oidc-bootstrap",
  deploymentMetadata.environment,
);
const stack = new Move37GithubOidcBootstrapStack(app, "Move37GithubOidcBootstrapStack", {
  env,
  stackName,
});
applyStandardTags(stack, stackName, deploymentMetadata);
