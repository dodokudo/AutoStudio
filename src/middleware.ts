import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/l/',
  '/login',
  '/api/auth/',
  '/api/cron/',
  '/api/threads/cron/',
  '/api/sales/cron/',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths - skip auth
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authToken = request.cookies.get('auth-token');
  if (authToken?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
