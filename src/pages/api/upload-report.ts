import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { supabase } from '../../lib/supabase';
import { getSupabaseAdmin } from '../../lib/supabase-admin';
import { uploadFileToR2 } from '../../lib/r2-client';

// Ensure this API route is rendered server-side on-demand (non-prerendered)
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin(env);

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

    // Guard: Limit user to a maximum of 5 reports per account (Gmail ID)
    const { count: totalReportsCount, error: countError } = await supabaseAdmin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Failed to verify user report limit:', countError);
      return new Response(
        JSON.stringify({ message: 'Server error. Failed to verify report analysis limits.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (totalReportsCount !== null && totalReportsCount >= 5) {
      return new Response(
        JSON.stringify({ message: 'Limit exceeded. You cannot analyze more than 5 reports per account.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Upload file buffer to Cloudflare R2 private bucket via S3 client
    const objectKey = await uploadFileToR2(fileBuffer, fileName, contentType, userId, env);

    // 5. Ensure user profile exists in profiles table before inserting report (due to foreign key constraint)
    const { data: profileExists, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileCheckError) {
      console.error('Profile check error:', profileCheckError);
    }

    if (!profileExists) {
      const { error: profileInsertError } = await supabaseAdmin
        .from('profiles')
        .insert({ id: userId });

      if (profileInsertError) {
        console.error('Failed to create missing profile:', profileInsertError);
        return new Response(
          JSON.stringify({ message: 'Server error. Failed to initialize user profile.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 6. Insert report record metadata row into the Supabase "reports" table
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

  } catch (err: any) {
    console.error('Unhandled upload API error:', err);
    return new Response(
      JSON.stringify({ 
        message: 'Server error. An unexpected error occurred during processing.',
        error: err?.message,
        stack: err?.stack
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
