import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Synchronizes Supabase authentication sessions and cookies in Next.js middleware.
 * Validates the user token against the Supabase Auth server and ensures refreshed cookies
 * are propagated to both Server Components and the browser response across localhost and LAN.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<{
 *   response: NextResponse,
 *   user: import('@supabase/supabase-js').User | null,
 *   supabase: import('@supabase/supabase-js').SupabaseClient | null,
 *   redirect: (pathname: string) => NextResponse
 * }>}
 */
export async function updateSession(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[Supabase Middleware] Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
    return {
      response: NextResponse.next({ request }),
      user: null,
      supabase: null,
      redirect: (path) => NextResponse.redirect(new URL(path, request.url)),
    };
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          const isLocalHttp = !process.env.VERCEL && !process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https');
          const safeOptions = {
            ...options,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production' && !isLocalHttp ? options?.secure : false,
          };
          supabaseResponse.cookies.set(name, value, safeOptions);
        });
      },
    },
  });

  // IMPORTANT: DO NOT remove auth.getUser() or replace with getSession().
  // getUser() validates the token cryptographically with Supabase Auth and triggers refresh if expired.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  /**
   * Helper function to perform redirects without losing refreshed auth cookies.
   * @param {string} pathname
   */
  const redirect = (pathname) => {
    const url = new URL(pathname, request.url);
    const redirectResponse = NextResponse.redirect(url);

    // Copy refreshed cookies from supabaseResponse to the redirect response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return redirectResponse;
  };

  return {
    response: supabaseResponse,
    user: error ? null : user,
    supabase,
    redirect,
  };
}
