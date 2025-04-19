# Image Processing Pipeline

This project implements a serverless image processing pipeline on AWS using S3, SQS, Lambda (container images), and API Gateway.

When a user uploads an image to the **original bucket**, an S3 event sends a message to **SQS**. A **processor Lambda** reads the message, resizes the image to `400×400` using **Sharp**, and stores the result in the **processed bucket**.  
A REST API endpoint (API Gateway + Lambda) allows **direct PUT uploads** of images (`.jpg`, `.png`, `.gif`).

---

## 📘 Table of Contents

1. [Architecture](#architecture)  
2. [Prerequisites](#prerequisites)  
3. [Initial Setup](#initial-setup)  
4. [Local Build & CDK Synth](#local-build--cdk-synth)  
5. [Deploy](#deploy)  
6. [Testing](#testing)  
7. [Cleanup](#cleanup)  
8. [Useful Commands](#useful-commands)  

---

## 🏗️ Architecture

```text
User
 └─PUT /upload/{key}─► API Gateway ─► Upload Lambda ─► Original S3 Bucket
                                               │
                                               └─📧 S3 ► SQS ► Process Lambda ─► Processed S3 Bucket
```

- **Upload Lambda**: Accepts PUT requests via API Gateway (binary image data) and uploads to `OriginalBucket`.
- **S3 → SQS**: Triggers on `.jpg`, `.png`, `.gif` uploads to `OriginalBucket`, sending messages to SQS.
- **Process Lambda**: Resizes images using Sharp (`400×400`) and saves them to `ProcessedBucket`.
- **CloudWatch Dashboard**: Monitors SQS (Visible, InFlight) and Lambda (Invocations, Errors) metrics.

---

## ✅ Prerequisites

- AWS Account (with CloudFormation/CDK permissions)  
- AWS CLI v2 (`aws configure`)  
- Docker (for building container images)  
- Node.js ≥ 16 & npm  
- AWS CDK v2 CLI (`npm install -g aws-cdk` or use `npx`)

Verify:

```bash
aws --version
docker --version
node --version
npm --version
cdk --version
```

---

## ⚙️ Initial Setup

1. Clone the repo:

```bash
git clone image-pipeline
cd image-pipeline
```

2. Install dependencies:

```bash
npm install
```

3. Configure AWS credentials:

```bash
aws configure
# Provide access key, secret, region (e.g., eu-central-1)
```

4. Bootstrap CDK:

```bash
npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/eu-central-1
```

---

## 🧪 Local Build & CDK Synth

1. Compile TypeScript:

```bash
npm run build
```

2. Synthesize CloudFormation templates:

```bash
npm run synth
```

Outputs saved to `cdk.out/`.

---

## 🚀 Deploy

Run:

```bash
npm run deploy
```

This will:

- Build TypeScript
- Build Docker images for Lambdas
- Publish assets to ECR
- Deploy `ImagePipelineStack`

### Resources Created:

- `image-pipeline-original-bucket` (S3)  
- `image-pipeline-image-queue` (SQS)  
- `ImagePipelineStack-processor` (Lambda)  
- `ImagePipelineStack-uploader` (Lambda)  
- `UploadApi` (API Gateway)  
- `image-pipeline-processed-bucket` (S3)  
- `ImagePipelineStack-dashboard` (CloudWatch)

---

## 🔬 Testing

### 1. Direct PUT Upload

```bash
curl -X PUT   -H "Content-Type: image/jpeg"   --data-binary @./local-image.jpg   https://<api-id>.execute-api.eu-central-1.amazonaws.com/prod/upload/my-image.jpg
```

- Returns `200 OK`
- File appears in **Original Bucket**

### 2. Verify Processing

After a few seconds, resized image appears in **Processed Bucket**:

```bash
aws s3 ls s3://image-pipeline-processed-bucket/
aws s3 cp s3://image-pipeline-processed-bucket/my-image.jpg .
```

### 3. View Metrics

Visit the **ImagePipelineStack-dashboard** in CloudWatch.

---

## 🧹 Cleanup

To destroy the stack and all resources:

```bash
npx cdk destroy ImagePipelineStack --force
# or
cdk destroy --all
```

> **Warning**: This deletes **all resources**, including S3 bucket contents.

---

## 🛠️ Useful Commands

List active CloudFormation stacks:

```bash
aws cloudformation list-stacks   --query "StackSummaries[?StackStatus!='DELETE_COMPLETE'].{Name:StackName,Status:StackStatus}"
```

List Lambda functions:

```bash
aws lambda list-functions --region eu-central-1
```

Check SQS metrics:

```bash
aws cloudwatch get-metric-statistics   --namespace AWS/SQS   --metric-name ApproximateNumberOfMessagesVisible   --dimensions Name=QueueName,Value=image-pipeline-image-queue   --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)   --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ)   --period 60 --statistics Sum
```

List objects in original bucket:

```bash
aws s3 ls s3://image-pipeline-original-bucket/
```

---

