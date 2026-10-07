import { createClient } from '@supabase/supabase-js';

/**
 * Creates a privileged Supabase Admin client with the service role key.
 *
 * ⚠️ WARNING: Use ONLY in server-side contexts (Server Actions, Route Handlers, Background jobs).
 * Never import into Client Components ('use client') as it bypasses Row Level Security (RLS).
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
