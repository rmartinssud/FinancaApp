import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { env, googleEnabled, authRateLimit } from "./env.js";
import { meRouter } from "./routes/me.js";
import { accountsRouter } from "./routes/accounts.js";
import { categoriesRouter } from "./routes/categories.js";
import { transactionsRouter } from "./routes/transactions.js";
import { summaryRouter } from "./routes/summary.js";
import { cardsRouter } from "./routes/cards.js";
import { cardExpensesRouter } from "./routes/cardExpenses.js";
import { budgetsRouter } from "./routes/budgets.js";
import { tagsRouter } from "./routes/tags.js";
import { uploadRouter, attachmentsRouter } from "./routes/attachments.js";
import { statsRouter, savingsRouter } from "./routes/stats.js";
import { reportsRouter } from "./routes/reports.js";
import { calendarRouter } from "./routes/calendar.js";
import { householdsRouter, familyRouter, invitesRouter } from "./routes/familia.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // atrás do Vite/nginx, pega o IP real
  app.use(helmet());

  // Só o nosso frontend pode chamar a API com cookies
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

  // Limita tentativas nas rotas de login para evitar ataques de força bruta
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Consultar a sessão não conta no limite
    skip: (req) => req.method === "GET" && req.path.startsWith("/get-session"),
    message: { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
  });

  // Rotas do Better Auth (/api/auth/...). Vêm ANTES do express.json()
  app.all("/api/auth/*splat", authLimiter, toNodeHandler(auth));

  // Upload de anexo: corpo cru (até 3 MB), antes do express.json()
  app.use("/api/transactions/:id/attachments", uploadRouter);

  app.use(express.json({ limit: "100kb" }));

  // Informa ao frontend quais opções de login estão ligadas
  app.get("/api/config", (_req, res) => {
    res.json({ google: googleEnabled });
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/me", meRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/summary", summaryRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/card-expenses", cardExpensesRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/savings", savingsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/households", householdsRouter);
  app.use("/api/family", familyRouter);
  app.use("/api/invites", invitesRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  // Erros inesperados: registra no console e responde sem detalhes
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  });

  return app;
}
