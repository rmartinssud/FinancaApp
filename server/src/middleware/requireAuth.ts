import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

// Bloqueia a rota se não houver sessão válida (cookie de login)
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      return res.status(401).json({ error: "Você precisa entrar na sua conta." });
    }
    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}
