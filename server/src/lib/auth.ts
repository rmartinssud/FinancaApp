import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "./prisma.js";
import { env, cookieSecure, googleEnabled } from "../env.js";
import { sendEmail, emailComLink } from "./email.js";
import { criarFamiliaInicial } from "../services/onboarding.js";

// Configuração central do login (Better Auth)
export const auth = betterAuth({
  appName: "Finanças Pessoais",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [env.FRONTEND_URL],

  // Email + senha
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true, // só entra depois de confirmar o email
    sendResetPassword: async ({ user, url }) => {
      const { text, html } = emailComLink(
        "Redefinir sua senha",
        "Recebemos um pedido para trocar a senha da sua conta no Finanças Pessoais.",
        "Criar nova senha",
        url,
      );
      await sendEmail({ to: user.email, subject: "Redefinir senha - Finanças Pessoais", text, html });
    },
    revokeSessionsOnPasswordReset: true,
  },

  // Verificação de email
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // reenvia o link se tentar entrar sem confirmar
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { text, html } = emailComLink(
        "Confirme seu email",
        `Olá, ${user.name}! Clique no botão abaixo para ativar sua conta.`,
        "Confirmar email",
        url,
      );
      await sendEmail({ to: user.email, subject: "Confirme seu email - Finanças Pessoais", text, html });
    },
  },

  // Login com Google: só liga se as variáveis estiverem no .env
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // renova uma vez por dia
  },

  // Cookies httpOnly + sameSite=lax; "secure" em produção (HTTPS)
  advanced: {
    useSecureCookies: cookieSecure,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: cookieSecure },
  },

  // Depois que o usuário é criado, monta a família dele
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await criarFamiliaInicial(user);
        },
      },
    },
  },

  plugins: [
    // Autenticação em dois fatores (app autenticador + códigos de backup)
    twoFactor({ issuer: "Finanças Pessoais" }),
  ],
});
