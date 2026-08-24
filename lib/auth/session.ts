import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/types";

const cookieName = "sunspark_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

const developmentSecret = "development-session-secret-change-me";

// Some hosting panels never inject NODE_ENV, so development has to be opted
// into explicitly. Anything else is treated as production and fails closed.
function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

/**
 * Session tokens are only as trustworthy as this secret. A shared fallback in
 * production would let anyone mint a token for any role, so outside development
 * a missing SESSION_SECRET is a hard failure rather than a silent default.
 */
function getSecret() {
  const secret = process.env.SESSION_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (!isDevelopment()) {
    throw new Error("SESSION_SECRET is not set. Refusing to sign sessions with a shared default secret.");
  }

  return developmentSecret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

const sessionTtlSeconds = 60 * 60 * 2;

type SessionPayload = SessionUser & { exp: number };

/**
 * The expiry is inside the signed payload, not just the cookie. A cookie's
 * maxAge is only a hint to the browser, so a token lifted from a machine stays
 * usable forever unless the server checks an expiry it signed itself.
 */
export function createSessionToken(user: SessionUser, nowSeconds = Math.floor(Date.now() / 1000)) {
  const claims: SessionPayload = { ...user, exp: nowSeconds + sessionTtlSeconds };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): SessionUser | null {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let claims: Partial<SessionPayload>;

  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPayload>;
  } catch {
    return null;
  }

  // Tokens minted before expiries were signed carry no exp, so they are treated
  // as expired rather than trusted indefinitely.
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    return null;
  }

  if (!claims.id || !claims.email || !claims.name || !claims.role) {
    return null;
  }

  return { id: claims.id, email: claims.email, name: claims.name, role: claims.role };
}

export async function setSession(user: SessionUser) {
  const cookieStore = await cookies();

  cookieStore.set(cookieName, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: !isDevelopment(),
    path: "/",
    maxAge: sessionTtlSeconds
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  return token ? verifySessionToken(token) : null;
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
