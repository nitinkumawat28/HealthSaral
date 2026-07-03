import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
// SERVER-ONLY variable
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// WARNING & SECURITY AUDIT NOTE: 
// The SUPABASE_SERVICE_ROLE_KEY has full admin privileges and bypasses Row Level Security (RLS).
// 1. NEVER expose this key to the browser / client-side.
// 2. NEVER import this file ('supabase-admin.js') in client-side code.
// 3. This file must only be imported in server contexts (e.g. Astro endpoints / API routes, middleware, or server-rendered pages).
// 4. Do not commit your active .env file containing this key to Git.

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
    'Please check your .env file.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
