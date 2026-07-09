import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { supabase } from '../../lib/supabase';
import { getSupabaseAdmin } from '../../lib/supabase-admin';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client } from '../../lib/r2-client';
import { analyzeReport } from '../../lib/gemini-client';

// Ensure this API route is rendered server-side on-demand (non-prerendered)
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin(env);
    const r2Client = getR2Client(env);
    // Step 1: Verify user authentication session using JWT Bearer token from header.
    // We retrieve the token from the "Authorization" header just like in upload-report.ts.
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ message: 'Access denied. Missing or malformed Authorization header.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7); // Extract the JWT token string after 'Bearer '
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ message: 'Authentication failed. Invalid or expired session token.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Retrieve reportId from request body.
    // If not found in the body, try reading it from the query parameters as a fallback.
    let reportId: string | null = null;
    try {
      const body = await request.json();
      reportId = body.reportId;
    } catch (e) {
      // Ignore parsing errors; try query parameters next
    }

    if (!reportId) {
      const url = new URL(request.url);
      reportId = url.searchParams.get('reportId');
    }

    if (!reportId) {
      return new Response(
        JSON.stringify({ message: 'Bad request. "reportId" parameter is missing.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Fetch report metadata from the database.
    // We use the supabaseAdmin client (service role) to query, ensuring the report belongs to this user.
    const { data: report, error: dbFetchError } = await supabaseAdmin
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbFetchError || !report) {
      console.error('Error fetching report record:', dbFetchError);
      return new Response(
        JSON.stringify({ message: 'Report not found or access denied.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Short-circuit if the report has already been successfully processed
    if (report.status === 'done') {
      return new Response(
        JSON.stringify({
          message: 'Report is already processed.',
          status: 'done',
          result: report.ai_result
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }



    // Step 4: Implement rate-limiting check.
    // Count how many reports are currently in "processing" status for this user.
    const { count: processingCount, error: countError } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .neq('id', reportId);

    if (countError) {
      console.error('Error counting processing reports:', countError);
      return new Response(
        JSON.stringify({ message: 'Server error. Failed to verify rate limits.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If there are already 5 or more reports actively processing, reject the request
    // to preserve Gemini API rate limits and avoid quota abuse.
    if (processingCount !== null && processingCount >= 5) {
      return new Response(
        JSON.stringify({ 
          message: 'Rate limit exceeded. You have too many reports processing simultaneously (Max 5). Please wait for them to complete.' 
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Mark the report status as "processing" in the database.
    // This locks the report so it cannot be double-processed by concurrent requests.
    const { error: updateProgressError } = await supabaseAdmin
      .from('reports')
      .update({ status: 'processing' })
      .eq('id', reportId);

    if (updateProgressError) {
      console.error('Failed to set status to processing:', updateProgressError);
      return new Response(
        JSON.stringify({ message: 'Server error. Failed to initiate report processing.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 6: Fetch the binary file payload from Cloudflare R2 bucket (or local filesystem fallback).
    let fileBuffer: Buffer;
    let mimeType: string;
    
    const isLocal = report.file_url.startsWith('local://');
    
    if (isLocal) {
      try {
        const localFileName = report.file_url.substring(8);
        const fs = await import('fs/promises');
        const path = await import('path');
        const localPath = path.join(process.cwd(), 'src', 'uploads', localFileName);
        
        fileBuffer = await fs.readFile(localPath);
        
        // Infer MIME type based on file extension
        const ext = path.extname(localFileName).toLowerCase();
        if (ext === '.pdf') {
          mimeType = 'application/pdf';
        } else if (ext === '.jpg' || ext === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === '.png') {
          mimeType = 'image/png';
        } else {
          mimeType = 'application/octet-stream';
        }
      } catch (localError: any) {
        console.error('Failed to read file from local fallback storage:', localError);
        await supabaseAdmin
          .from('reports')
          .update({ status: 'failed' })
          .eq('id', reportId);

        return new Response(
          JSON.stringify({ message: 'Failed to retrieve the report file from local storage.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      try {
        let fileBytes;
        if (env?.R2_BUCKET) {
          console.log('Using native Cloudflare R2 bucket binding for download...');
          const r2Object = await env.R2_BUCKET.get(report.file_url);
          if (!r2Object) {
            throw new Error(`Object not found in R2 bucket: ${report.file_url}`);
          }
          fileBytes = await r2Object.arrayBuffer();
          mimeType = r2Object.httpMetadata?.contentType || 'application/pdf';
        } else {
          const bucketName = env?.R2_BUCKET_NAME || import.meta.env.R2_BUCKET_NAME || (typeof process !== 'undefined' ? process.env.R2_BUCKET_NAME : undefined);
          const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: report.file_url,
          });

          const s3Response = await r2Client.send(getCommand);
          if (!s3Response.Body) {
            throw new Error('S3 GetObject response body is empty.');
          }

          fileBytes = await s3Response.Body.transformToByteArray();
          mimeType = s3Response.ContentType || 'application/pdf';
        }
        fileBuffer = Buffer.from(fileBytes);

      } catch (r2Error: any) {
        console.error('Failed to fetch file from Cloudflare R2:', r2Error);
        
        // Update database status to "failed"
        await supabaseAdmin
          .from('reports')
          .update({ status: 'failed' })
          .eq('id', reportId);

        return new Response(
          JSON.stringify({ message: 'Failed to retrieve the uploaded report file for analysis.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 7: Send the file to the Google Gemini API client for medical interpretation.
    const aiResponse = await analyzeReport(fileBuffer, mimeType, env);

    if (!aiResponse.success) {
      console.error('Gemini Analysis Failed:', aiResponse.error);

      // Step 8a: Handle failure — update database row status to "failed"
      await supabaseAdmin
        .from('reports')
        .update({ status: 'failed' })
        .eq('id', reportId);

      return new Response(
        JSON.stringify({ message: 'AI processing failed. Could not interpret the health report.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 8b: Handle success — save parsed AI results and set status to "done"
    const { error: updateSuccessError } = await supabaseAdmin
      .from('reports')
      .update({
        status: 'done',
        ai_result: aiResponse.data // Store parsed JSON object directly in JSONB column
      })
      .eq('id', reportId);

    if (updateSuccessError) {
      console.error('Failed to update success state in database:', updateSuccessError);
      return new Response(
        JSON.stringify({ message: 'AI analysis completed, but failed to save the results.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the completed analysis response to the client
    return new Response(
      JSON.stringify({
        message: 'Report processed successfully.',
        status: 'done',
        result: aiResponse.data
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    // Log unexpected errors securely without leaking internals to public clients
    console.error('Unhandled process-report API error:', error);
    return new Response(
      JSON.stringify({ message: 'An unexpected internal error occurred.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
