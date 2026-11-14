import type { Request, Response, NextFunction } from "express";
import type { PlatformRole } from "@prisma/client";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth.js";
import { prisma } from "../../lib/prisma.js";

// ─────────────────────────────────────────────
// Papéis da PLATAFORMA (Educação financeira). Não confundir com os papéis dos espaços (OWNER/ADMIN/...).
// - ADMIN: quem está em ADMIN_EMAILS (variável de ambiente, separada por vírgula) com email confirmado,
//   ou quem tem platformRole = ADMIN no banco. Gerencia tudo, publica e dá o papel de EDITOR.
// - EDITOR: dado por um ADMIN na tela de Equipe. Cria e edita o próprio conteúdo e envia para revisão.
// - USER: todo o resto (só lê).
// ─────────────────────────────────────────────

export type Leitor = { id: string; email: string; papel: PlatformRole };

// Lido na hora (não no boot) para os testes poderem mudar e para valer logo depois de um redeploy
export function emailsAdmin(): string[] {
  return String(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function papelEfetivo(u: { email: string; emailVerified?: boolean | null; platformRole: PlatformRole }): PlatformRole {
  if (u.emailVerified && emailsAdmin().includes(u.email.toLowerCase())) return "ADMIN";
  return u.platformRole;
}

export const ehEquipe = (papel?: PlatformRole | null) => papel === "ADMIN" || papel === "EDITOR";

async function leitorDoUsuario(userId: string): Promise<Leitor | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true, platformRole: true } });
  return u ? { id: u.id, email: u.email, papel: papelEfetivo(u) } : null;
}

// Sessão opcional: páginas públicas funcionam sem login, mas sabem quem é quando há login.
// Coloca req.user (se houver) e res.locals.leitor (Leitor | null).
export async function sessaoOpcional(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    res.locals.leitor = null;
    if (session) {
      req.user = session.user;
      res.locals.leitor = await leitorDoUsuario(session.user.id);
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Depois do requireAuth: carrega o papel e só deixa passar EDITOR/ADMIN
export async function exigeEquipe(req: Request, res: Response, next: NextFunction) {
  try {
    const leitor = req.user ? await leitorDoUsuario(req.user.id) : null;
    if (!leitor || !ehEquipe(leitor.papel)) {
      return res.status(403).json({ error: "Esta área é só para a equipe de conteúdo do Famicash." });
    }
    res.locals.leitor = leitor;
    next();
  } catch (err) {
    next(err);
  }
}

export function exigeAdmin(_req: Request, res: Response, next: NextFunction) {
  if ((res.locals.leitor as Leitor | null)?.papel !== "ADMIN") {
    return res.status(403).json({ error: "Só um administrador pode fazer isso." });
  }
  next();
}

export async function papelDoUsuario(userId: string): Promise<PlatformRole> {
  return (await leitorDoUsuario(userId))?.papel ?? "USER";
}
