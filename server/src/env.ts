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
  // Bot do WhatsApp (Meta WhatsApp Cloud API). Sem as quatro primeiras, o WhatsApp fica desligado.
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),
  // Número do bot como aparece para as pessoas (tela do app e mensagens)
  WHATSAPP_BOT_NUMBER: z.string().default("+55 21 3955-2279"),
  // Áudio e foto no WhatsApp: provedor de IA (hoje só "gemini", o padrão). Sem chave, o bot avisa que chega em breve.
  AI_PROVIDER: z.enum(["gemini", ""]).optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
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

// WhatsApp ligado? (lido na hora, para os testes poderem desligar)
export function whatsappConfig() {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneNumberId, WHATSAPP_VERIFY_TOKEN: verifyToken, WHATSAPP_APP_SECRET: appSecret } = env;
  if (!token || !phoneNumberId || !verifyToken || !appSecret) return null;
  return { token, phoneNumberId, verifyToken, appSecret, graphVersion: env.WHATSAPP_GRAPH_VERSION, botNumber: env.WHATSAPP_BOT_NUMBER };
}
