import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth middleware — protects API routes when AUTH_TOKEN is configured.
 * Without AUTH_TOKEN, all routes are open (demo mode).
 */
export function middleware(request: NextRequest) {
  const authToken = process.env.AUTH_TOKEN;

  // No AUTH_TOKEN = demo mode, all access allowed
  if (!authToken) return NextResponse.next();

  // Public routes — no auth needed
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${authToken}`) return NextResponse.next();

  // Check cookie
  const cookieToken = request.cookies.get("auth_token")?.value;
  if (cookieToken === authToken) return NextResponse.next();

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}

export const config = {
  matcher: "/api/:path*",
};
