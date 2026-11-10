import "dotenv/config";
import { z } from "zod";

// Lê e valida as variáveis de ambiente. Se faltar algo, o servidor nem sobe.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"),
  // Endereço público onde o /api fica acessível (no dev, o próprio Vite via proxy)
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  // Cookies "secure" (só HTTPS). Em produção fica ligado por padrão.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Limite de tentativas nas rotas de login (por IP, a cada 15 minutos).
  // Sem valor: 30 em produção e 1000 em dev/teste (para não travar os testes locais).
  AUTH_RATE_LIMIT: z.coerce.number().optional(),
  // Pasta dos anexos dos lançamentos (no Coolify: volume persistente montado aqui)
  UPLOADS_DIR: z.string().min(1).default("/data/anexos"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const authRateLimit = env.AUTH_RATE_LIMIT ?? (isProduction ? 30 : 1000);
export const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction;
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
