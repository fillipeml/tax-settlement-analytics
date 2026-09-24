import { NextRequest, NextResponse } from "next/server";
import { authenticate, createToken, NAME_COOKIE, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/session";

export async function POST(req: NextRequest) {
  let body: { user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const ok = await authenticate(body.user ?? "", body.password ?? "");
  if (!ok) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  const res = NextResponse.json({ name: ok.name });
  const base = {
    path: "/",
    maxAge: SESSION_TTL_S,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  res.cookies.set(SESSION_COOKIE, await createToken(body.user!, ok.name), { ...base, httpOnly: true });
  res.cookies.set(NAME_COOKIE, ok.name, base); // display only, read by the header
  return res;
}
