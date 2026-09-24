/** Sessions as a signed cookie (HMAC-SHA256, Web Crypto): works in the edge middleware and in
 *  the API routes with no dependency and no database.
 *
 *  Users: env APP_USERS = JSON [{"user","name","sha256"}] where sha256 is the hex digest of the
 *  password. Without APP_USERS, the SHARED_USER / SHARED_PASSWORD pair is accepted. In demo
 *  mode (DEMO_MODE=true) the pair demo / demo works and the middleware signs visitors in
 *  automatically. Fail-closed everywhere else.
 */

const SESSION_COOKIE = "tsa_session";
const NAME_COOKIE = "tsa_name"; // display only (not a credential)
const SESSION_TTL_S = 12 * 60 * 60; // 12 h

export { NAME_COOKIE, SESSION_COOKIE, SESSION_TTL_S };

export const isDemoMode = () => process.env.DEMO_MODE === "true";

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SHARED_PASSWORD || (isDemoMode() ? "demo-only-not-a-secret" : "");
  if (!s) throw new Error("Set SESSION_SECRET (or SHARED_PASSWORD) in the environment.");
  return s;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Session {
  user: string;
  name: string;
  exp: number;
}

export async function createToken(user: string, name: string): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ user, name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S } satisfies Session)),
  );
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if ((await hmac(payload)) !== signature) return null;
    const s = JSON.parse(b64urlDecode(payload)) as Session;
    if (s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

interface RegisteredUser {
  user: string;
  name: string;
  sha256: string;
}

export async function authenticate(user: string, password: string): Promise<{ name: string } | null> {
  if (!user || !password) return null;
  if (isDemoMode() && user === "demo" && password === "demo") return { name: "Demo user" };
  const list = process.env.APP_USERS;
  if (list) {
    try {
      const users = JSON.parse(list) as RegisteredUser[];
      const u = users.find((x) => x.user.toLowerCase() === user.toLowerCase());
      if (u && (await sha256Hex(password)) === u.sha256.toLowerCase()) return { name: u.name };
    } catch {
      return null; // malformed APP_USERS: fail closed
    }
    return null;
  }
  if (process.env.SHARED_USER && user === process.env.SHARED_USER && password === process.env.SHARED_PASSWORD) {
    return { name: "Team" };
  }
  return null;
}
