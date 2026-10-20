import "./env";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_USER = process.env.ADMIN_USER?.trim() || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionPayload {
  sub: string;
  exp: number;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(username: string): string {
  if (!ADMIN_TOKEN) {
    throw new Error("ADMIN_TOKEN is not configured.");
  }

  const payload: SessionPayload = {
    sub: username,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encoded, ADMIN_TOKEN);

  return `${encoded}.${signature}`;
}

function verifySessionToken(token: string): boolean {
  if (!ADMIN_TOKEN) return false;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = signPayload(encoded, ADMIN_TOKEN);
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;

    return (
      payload.sub === ADMIN_USER &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now()
    );
  } catch {
    return false;
  }
}

function authConfigError(res: Response) {
  console.warn(
    "[auth] ADMIN_TOKEN or ADMIN_PASSWORD not configured - admin routes disabled",
  );
  return res.status(503).json({
    message: "Admin authentication not configured on server.",
  });
}

/**
 * POST /admin/login
 * Valida usuario y contraseña y devuelve un token de sesión firmado.
 */
export async function adminLogin(req: Request, res: Response) {
  if (!ADMIN_TOKEN || !ADMIN_PASSWORD) {
    return authConfigError(res);
  }

  const { username, password } = (req.body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({
      message: "Usuario y contraseña son obligatorios.",
    });
  }

  const userOk = safeEqual(username, ADMIN_USER);
  const passwordOk = safeEqual(password, ADMIN_PASSWORD);

  if (!userOk || !passwordOk) {
    // Pequeña espera para dificultar intentos de fuerza bruta.
    await new Promise((resolve) => setTimeout(resolve, 350));
    return res.status(401).json({
      message: "Usuario o contraseña incorrectos.",
    });
  }

  return res.json({
    token: createSessionToken(ADMIN_USER),
    user: ADMIN_USER,
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    return authConfigError(res);
  }

  const token = String(req.get("x-admin-token") ?? "");
  if (!verifySessionToken(token)) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  next();
}

export function optionalAdmin(req: Request, res: Response, next: NextFunction) {
  const adminReq = req as Request & { isAdmin?: boolean };

  if (!ADMIN_TOKEN) {
    adminReq.isAdmin = false;
    return next();
  }

  const token = String(req.get("x-admin-token") ?? "");
  adminReq.isAdmin = verifySessionToken(token);
  next();
}
