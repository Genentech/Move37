#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PenroselamarckGithubOidcBootstrapStack } from "../lib/penroselamarck-github-oidc-bootstrap-stack";
import {
  applyStandardTags,
  resolveDeploymentMetadata,
  stackNameWithEnvironment,
} from "./deployment-conventions";

const app = new cdk.App();
const region = process.env.CDK_DEFAULT_REGION ?? "eu-central-1";
const deploymentMetadata = resolveDeploymentMetadata(region, "oidc");
const oidcStackName = stackNameWithEnvironment(
  "penroselamarck-github-oidc-bootstrap",
  deploymentMetadata.environment,
);

const oidcBootstrapStack = new PenroselamarckGithubOidcBootstrapStack(
  app,
  "PenroselamarckGithubOidcBootstrapStack",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region,
    },
    stackName: oidcStackName,
  },
);

applyStandardTags(oidcBootstrapStack, oidcStackName, deploymentMetadata);
