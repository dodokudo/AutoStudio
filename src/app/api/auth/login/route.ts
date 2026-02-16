import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('auth-token', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
