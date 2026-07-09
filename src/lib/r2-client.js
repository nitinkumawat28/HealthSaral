import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// WARNING & SECURITY AUDIT NOTE:
// This file uses secret Cloudflare R2 API credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
// 1. NEVER import this file in client-side / browser code.
// 2. This must only be run in server contexts (e.g. Astro endpoints / API routes, middleware, or server-rendered pages).
// 3. Keep the R2 bucket private. Do not generate any public URL logic.

// Create the R2 client dynamically with runtime environment fallback support
export function getR2Client(env) {
  const accountId = env?.R2_ACCOUNT_ID || import.meta.env.R2_ACCOUNT_ID || (typeof process !== 'undefined' ? process.env.R2_ACCOUNT_ID : undefined);
  const accessKeyId = env?.R2_ACCESS_KEY_ID || import.meta.env.R2_ACCESS_KEY_ID || (typeof process !== 'undefined' ? process.env.R2_ACCESS_KEY_ID : undefined);
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY || import.meta.env.R2_SECRET_ACCESS_KEY || (typeof process !== 'undefined' ? process.env.R2_SECRET_ACCESS_KEY : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// Export a static instance if env is available at load time, otherwise allow dynamic instantiation
export let r2Client;
try {
  r2Client = getR2Client();
} catch (e) {
  // Silently ignore module-level errors during Cloudflare Workers import
}

/**
 * Uploads a file buffer to Cloudflare R2, with a local filesystem fallback on failure.
 * Key path template: reports/{userId}/{timestamp}-{fileName}
 * 
 * @param {Buffer | Uint8Array} fileBuffer - The file content buffer.
 * @param {string} fileName - Original file name.
 * @param {string} contentType - MIME type of the file.
 * @param {string} userId - User's ID for folder categorization.
 * @param {any} [env] - Optional runtime environment bindings.
 * @returns {Promise<string>} - Resolves to the uploaded object's key or a local:// file path.
 */
export async function uploadFileToR2(fileBuffer, fileName, contentType, userId, env) {
  const timestamp = Date.now();
  const cleanFileName = fileName.replace(/\s+/g, '-');
  const objectKey = `reports/${userId}/${timestamp}-${cleanFileName}`;

  const bucketName = env?.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || (typeof process !== 'undefined' ? process.env.R2_BUCKET_NAME : undefined);

  if (!bucketName) {
    throw new Error('R2_BUCKET_NAME is not defined in environment variables.');
  }

  try {
    const client = getR2Client(env);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await client.send(command);
    return objectKey;
  } catch (err) {
    console.warn('R2 upload failed, writing file to local fallback storage instead:', err.message);
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const uploadsDir = path.join(process.cwd(), 'src/uploads');
      
      // Ensure the local uploads directory exists
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const localFileName = `${timestamp}-${cleanFileName}`;
      const localPath = path.join(uploadsDir, localFileName);
      
      await fs.writeFile(localPath, fileBuffer);
      
      // Return a special local identifier
      return `local://${localFileName}`;
    } catch (fsErr) {
      console.error('Failed to write local fallback file:', fsErr);
      throw err; // throw original R2 upload error if fallback also fails
    }
  }
}
