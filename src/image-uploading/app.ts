import {APIGatewayProxyHandler} from 'aws-lambda';
import {S3Client, PutObjectCommandInput} from '@aws-sdk/client-s3';
import {Upload} from '@aws-sdk/lib-storage';
import {PassThrough} from 'stream';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

const ALLOWED_EXT = (process.env.ALLOWED_EXT || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(e => e.startsWith('.'));

export const handler: APIGatewayProxyHandler = async (event) => {
  const key = event.pathParameters?.key;
  if (!key) {
    return { statusCode: 400, body: 'Missing path parameter "key"' };
  }
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')).toLowerCase() : '';
  if (!ALLOWED_EXT.includes(ext)) {
    return { statusCode: 400, body: `Extension "${ext}" not allowed` };
  }
  if (!event.body || !event.isBase64Encoded) {
    return { statusCode: 400, body: 'Body must be base64-encoded binary' };
  }

  const pass = new PassThrough();
  const params: PutObjectCommandInput = {
    Bucket: process.env.BUCKET!,
    Key: key,
    Body: pass,
    ContentType: event.headers['content-type'] || `image/${ext.slice(1)}`
  };

  const uploader = new Upload({
    client: s3,
    params,
    queueSize: 4,
    partSize: 5 * 1024 * 1024
  });

  pass.end(Buffer.from(event.body, 'base64'));

  try {
    await uploader.done();  // чекаємо завершення всіх частин
  } catch (err: unknown) {
    console.error('S3 multipart upload failed', err);
    return { statusCode: 500, body: 'Failed to upload to S3' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Upload successful', key }),
    headers: { 'Content-Type': 'application/json' }
  };
};
