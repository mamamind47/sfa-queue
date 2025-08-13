import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // ป้องกันเส้นทาง /staff ทั้งหมดยกเว้น /staff/login
  const url = req.nextUrl;
  if (url.pathname.startsWith("/staff") && url.pathname !== "/staff/login") {
    const token = req.cookies.get("auth_token")?.value;
    if (!token) {
      const loginUrl = new URL("/staff/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*"],
};