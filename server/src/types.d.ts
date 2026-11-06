import type { MemberRole } from "@prisma/client";

// Campos extras que os middlewares colocam no "req"
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; email: string; emailVerified: boolean; twoFactorEnabled?: boolean | null; image?: string | null };
      household?: { id: string; name: string; role: MemberRole };
    }
  }
}

export {};
