import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// WARNING & SECURITY AUDIT NOTE:
// This file uses secret Cloudflare R2 API credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
// 1. NEVER import this file in client-side / browser code.
// 2. This must only be run in server contexts (e.g. Astro endpoints / API routes, middleware, or server-rendered pages).
// 3. Keep the R2 bucket private. Do not generate any public URL logic.

const accountId = import.meta.env.R2_ACCOUNT_ID;
const accessKeyId = import.meta.env.R2_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.R2_SECRET_ACCESS_KEY;
const bucketName = import.meta.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  throw new Error(
    'Missing one or more Cloudflare R2 environment variables. ' +
    'Please verify R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your .env file.'
  );
}

// Configure S3Client for Cloudflare R2 compatibility
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Uploads a file buffer to Cloudflare R2.
 * Key path template: reports/{userId}/{timestamp}-{fileName}
 * 
 * @param {Buffer | Uint8Array} fileBuffer - The file content buffer.
 * @param {string} fileName - Original file name.
 * @param {string} contentType - MIME type of the file.
 * @param {string} userId - User's ID for folder categorization.
 * @returns {Promise<string>} - Resolves to the uploaded object's key.
 */
export async function uploadFileToR2(fileBuffer, fileName, contentType, userId) {
  const timestamp = Date.now();
  const cleanFileName = fileName.replace(/\s+/g, '-');
  const objectKey = `reports/${userId}/${timestamp}-${cleanFileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return objectKey;
}
