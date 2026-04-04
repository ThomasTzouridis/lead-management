import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get("app_auth")?.value;
  const password = process.env.APP_PASSWORD;

  // No password set = no protection (dev mode)
  if (!password) return NextResponse.next();

  // Already authenticated
  if (authCookie === password) return NextResponse.next();

  // Login page and login API are always accessible
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/api/login"
  ) {
    return NextResponse.next();
  }

  // Redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
