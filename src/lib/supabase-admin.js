import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY variable

// WARNING & SECURITY AUDIT NOTE: 
// The SUPABASE_SERVICE_ROLE_KEY has full admin privileges and bypasses Row Level Security (RLS).
// 1. NEVER expose this key to the browser / client-side.
// 2. NEVER import this file ('supabase-admin.js') in client-side code.
// 3. This file must only be imported in server contexts (e.g. Astro endpoints / API routes, middleware, or server-rendered pages).
// 4. Do not commit your active .env file containing this key to Git.

// Create the admin client dynamically with runtime environment fallback support
export function getSupabaseAdmin(env) {
  const supabaseUrl = env?.PUBLIC_SUPABASE_URL || import.meta.env?.PUBLIC_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.PUBLIC_SUPABASE_URL : undefined);
  const supabaseServiceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env?.SUPABASE_SERVICE_ROLE_KEY || (typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Export a static instance if env is available at load time, otherwise allow dynamic instantiation
export let supabaseAdmin;
try {
  supabaseAdmin = getSupabaseAdmin();
} catch (e) {
  // Silently ignore module-level errors during Cloudflare Workers import
}
