import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

console.log('Account ID:', accountId);
console.log('Access Key ID:', accessKeyId);
console.log('Bucket Name:', bucketName);

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function run() {
  try {
    const testKey = 'test-upload.txt';
    console.log('Testing upload...');
    await r2Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: 'Hello HealthSaral!',
      ContentType: 'text/plain'
    }));
    console.log('Upload success!');

    console.log('Testing download...');
    const res = await r2Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: testKey
    }));
    const text = await res.Body.transformToString();
    console.log('Download success! Content:', text);
  } catch (err) {
    console.error('Error during read/write operations:', err);
  }
}

run();
