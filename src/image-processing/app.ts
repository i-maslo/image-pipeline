import {SQSHandler, SQSRecord} from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput
} from '@aws-sdk/client-s3';
import {Readable} from 'stream';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import {Upload} from '@aws-sdk/lib-storage';

interface S3Notification {
  Records: [{ s3: { bucket: { name: string }, object: { key: string } } }];
}

export const handler: SQSHandler = async (event) => {
  const rec: SQSRecord | undefined = event.Records[0];
  if (!rec) return;

  const body = JSON.parse(rec.body) as S3Notification;
  const {
    s3: {
      bucket: { name: sourceBucket },
      object: { key: rawKey }
    }
  } = body.Records[0];
  const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));

  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const getRes: GetObjectCommandOutput = await s3.send(
    new GetObjectCommand({ Bucket: sourceBucket, Key: key })
  );
  const input = getRes.Body as Readable;

  sharp.cache(false);
  sharp.concurrency(1);

  const transformer = sharp().resize(400, 400);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: input.pipe(transformer),
      ContentType: getRes.ContentType ?? 'application/octet-stream',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024
  });

  await upload.done();

  console.log(`Processed ${key}`);
};