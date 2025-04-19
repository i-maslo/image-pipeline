import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {
  DockerImageFunction,
  DockerImageCode,
} from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import {Platform} from "aws-cdk-lib/aws-ecr-assets";

export class ImagePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dockerDir = path.join(__dirname, '..'); // корінь, де лежить Dockerfile

    // 1) Original images bucket
    const original = new s3.Bucket(this, 'OriginalBucket', {
      bucketName: `${this.stackName.toLowerCase()}-original-bucket`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2) SQS queue
    const queue = new sqs.Queue(this, 'ImageQueue', {
      queueName: `${this.stackName.toLowerCase()}-image-queue`,
      visibilityTimeout: cdk.Duration.seconds(60),
    });

    // 3) S3 → SQS notifications
    for (const ext of ['.jpg','.JPG','.png','.PNG','.gif','.GIF']) {
      original.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.SqsDestination(queue),
        { suffix: ext }
      );
    }

    // 4) Processed images bucket
    const processed = new s3.Bucket(this, 'ProcessedBucket', {
      bucketName: `${this.stackName.toLowerCase()}-processed-bucket`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 5) Containerized Lambda for image processing (processor stage)
    const processorFn = new DockerImageFunction(this, 'ImageProcessorFn', {
      code: DockerImageCode.fromImageAsset(dockerDir, {
        file: 'Dockerfile',
        target: 'processor',
        platform: Platform.LINUX_AMD64
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ORIGINAL_BUCKET: original.bucketName,
        PROCESSED_BUCKET: processed.bucketName,
      },
    });
    original.grantRead(processorFn);
    processed.grantWrite(processorFn);
    processorFn.addEventSource(
      new eventsources.SqsEventSource(queue, { batchSize: 1 })
    );

    // 6) Containerized Lambda for upload (uploader stage)
    const uploadFn = new DockerImageFunction(this, 'UploadFunction', {
      code: DockerImageCode.fromImageAsset(dockerDir, {
        file: 'Dockerfile',
        target: 'uploader',
        platform: Platform.LINUX_AMD64
      }),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        BUCKET: original.bucketName,
        ALLOWED_EXT: '.jpg,.png,.gif',
      },
    });
    original.grantWrite(uploadFn);

    // API Gateway for direct PUT uploads
    const api = new apigw.RestApi(this, 'UploadApi', {
      restApiName: 'Image Upload Service',
      binaryMediaTypes: ['image/jpeg', 'image/png', 'image/gif'],
      defaultCorsPreflightOptions: {
        allowMethods: ['OPTIONS', 'PUT'],
        allowOrigins: ['*'],
      },
    });
    const upload = api.root.addResource('upload');
    upload
      .addResource('{key}')
      .addMethod(
        'PUT',
        new apigw.LambdaIntegration(uploadFn, { proxy: true }),
        { requestParameters: { 'method.request.path.key': true } }
      );

    // 7) CloudWatch dashboard
    new cw.CfnDashboard(this, 'Dashboard', {
      dashboardName: `${this.stackName}-dashboard`,
      dashboardBody: JSON.stringify({
        widgets: [
          {
            type: 'metric',
            x: 0,
            y: 0,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                [
                  'AWS/SQS',
                  'ApproximateNumberOfMessagesVisible',
                  'QueueName',
                  queue.queueName,
                ],
              ],
              period: 300,
              stat: 'Sum',
              region: this.region,
              view: 'timeSeries',
              annotations: {},
              title: 'SQS: Messages Visible',
            },
          },
          {
            type: 'metric',
            x: 12,
            y: 0,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                [
                  'AWS/SQS',
                  'ApproximateNumberOfMessagesNotVisible',
                  'QueueName',
                  queue.queueName,
                ],
              ],
              period: 300,
              stat: 'Sum',
              region: this.region,
              view: 'timeSeries',
              annotations: {},
              title: 'SQS: Messages In Flight',
            },
          },
          {
            type: 'metric',
            x: 0,
            y: 6,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                ['AWS/Lambda', 'Invocations', 'FunctionName', processorFn.functionName],
              ],
              period: 300,
              stat: 'Sum',
              region: this.region,
              view: 'timeSeries',
              annotations: {},
              title: 'Lambda Invocations',
            },
          },
          {
            type: 'metric',
            x: 12,
            y: 6,
            width: 12,
            height: 6,
            properties: {
              metrics: [
                ['AWS/Lambda', 'Errors', 'FunctionName', processorFn.functionName],
              ],
              period: 300,
              stat: 'Sum',
              region: this.region,
              view: 'timeSeries',
              annotations: {},
              title: 'Lambda Errors',
            },
          },
        ],
      }),
    });
  }
}
