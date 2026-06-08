import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MAINTENANCE_PATH = "/manutencao";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Already on maintenance page — let through
  if (pathname === MAINTENANCE_PATH) {
    return NextResponse.next();
  }

  // Redirect everything else to maintenance
  return NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)",
  ],
};
