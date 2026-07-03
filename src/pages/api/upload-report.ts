import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { supabaseAdmin } from '../../lib/supabase-admin';
import { uploadFileToR2 } from '../../lib/r2-client';

// Ensure this API route is rendered server-side on-demand (non-prerendered)
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Verify user authentication session using JWT Bearer token from header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ message: 'Access denied. Missing or malformed Authorization header.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7); // Extract the token after 'Bearer '
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ message: 'Authentication failed. Invalid or expired session token.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request FormData for the file payload
    const formData = await request.formData();
    const file = formData.get('reportFile');

    if (!file || typeof file === 'string') {
      return new Response(
        JSON.stringify({ message: 'Bad request. No file payload found under the field "reportFile".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validate file format type & size limits (Max 10MB)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ message: 'Validation failed. Supported formats are PDF, JPG, and PNG only.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return new Response(
        JSON.stringify({ message: 'Validation failed. File size exceeds the maximum limit of 10MB.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert file to buffer for S3 upload compatibility
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const contentType = file.type;
    const userId = user.id;

    // 4. Upload file buffer to Cloudflare R2 private bucket via S3 client
    const objectKey = await uploadFileToR2(fileBuffer, fileName, contentType, userId);

    // 5. Insert report record metadata row into the Supabase "reports" table
    const { data: reportRow, error: dbError } = await supabaseAdmin
      .from('reports')
      .insert({
        user_id: userId,
        file_url: objectKey,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Supabase DB Insert Error:', dbError);
      return new Response(
        JSON.stringify({ message: 'Server error. Failed to save report metadata to database.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return successful response with the saved record details
    return new Response(
      JSON.stringify({
        message: 'Report uploaded and recorded successfully.',
        report: reportRow
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unhandled upload API error:', err);
    return new Response(
      JSON.stringify({ message: 'Server error. An unexpected error occurred during processing.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
