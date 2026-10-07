import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for Server Components, Server Actions, and Route Handlers.
 * Handles reading and setting session cookies in Next.js Server contexts across localhost and LAN IPs.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const isLocalHttp = !process.env.VERCEL && !process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https');
            const safeOptions = {
              ...options,
              sameSite: 'lax',
              path: '/',
              secure: process.env.NODE_ENV === 'production' && !isLocalHttp ? options?.secure : false,
            };
            cookieStore.set(name, value, safeOptions);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // Handled gracefully by middleware.
        }
      },
    },
  });
}
