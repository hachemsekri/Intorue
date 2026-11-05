import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password', '/invitation', '/embed'];

/**
 * UX redirect only: real authorization happens in the API on every request.
 * winou_session is a non-secret marker set alongside the httpOnly auth cookies.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('winou_session') || req.cookies.has('winou_at');
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/map', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon|.*\\..*).*)'] };
