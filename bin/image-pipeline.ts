#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {ImagePipelineStack} from '../lib/image-pipeline-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-central-1' };

new ImagePipelineStack(app, 'ImagePipelineStack', { env });