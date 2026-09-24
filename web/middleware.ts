import { NextRequest, NextResponse } from "next/server";
import { createToken, isDemoMode, NAME_COOKIE, SESSION_COOKIE, SESSION_TTL_S, verifyToken } from "@/lib/session";

/** Login-first product: every route needs a session except /sign-in, the auth APIs and static
 *  files (which include /data/terms.json: public PGFN data). In demo mode a visitor without a
 *  session is signed in as "Demo user" on the fly, so the demo needs no credentials. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/sign-in") {
    return session ? NextResponse.redirect(new URL("/app", req.url)) : NextResponse.next();
  }

  if (!session) {
    if (isDemoMode()) {
      const res = NextResponse.next();
      const base = { path: "/", maxAge: SESSION_TTL_S, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
      res.cookies.set(SESSION_COOKIE, await createToken("demo", "Demo user"), { ...base, httpOnly: true });
      res.cookies.set(NAME_COOKIE, "Demo user", base);
      return res;
    }
    const target = new URL("/sign-in", req.url);
    target.searchParams.set("from", pathname);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  // everything except the auth APIs, Next internals and static files (they contain a ".")
  matcher: ["/((?!api/sign-in|api/sign-out|_next|.*\\..*).*)"],
};
