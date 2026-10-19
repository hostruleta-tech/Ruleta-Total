import "./env";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    console.warn("[auth] ADMIN_TOKEN not configured - admin routes disabled");
    return res.status(503).json({
      message: "Admin authentication not configured on server.",
    });
  }

  const provided = String(req.get("x-admin-token") ?? "");
  const expected = ADMIN_TOKEN;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  next();
}

export function optionalAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    (req as any).isAdmin = false;
    return next();
  }

  const provided = String(req.get("x-admin-token") ?? "");
  const expected = ADMIN_TOKEN;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  (req as any).isAdmin = a.length === b.length && timingSafeEqual(a, b);
  next();
}