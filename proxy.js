import { updateSession } from '@/lib/supabase/middleware';

// Routes that require an active authenticated user
const PROTECTED_PREFIXES = ['/chat', '/dashboard', '/profile', '/settings'];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const { response, user, redirect } = await updateSession(request);

  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // 1. Unauthenticated users attempting to access protected routes -> redirect to login (/)
  if (isProtectedRoute && !user) {
    return redirect('/');
  }

  // 2. Return response with synchronized cookies
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static asset extensions (.svg, .png, .jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
