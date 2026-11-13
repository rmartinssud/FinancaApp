import { createApp } from "./app.js";
import { env } from "./env.js";
import { agendarEfetivacao } from "./services/autoEfetivar.js";
import { agendarAlertas } from "./services/alertas/motor.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
  // Efetivação automática de receitas/despesas vencidas (no start e a cada hora)
  if (env.NODE_ENV !== "test") agendarEfetivacao();
  // Alertas por e-mail (orçamento, fatura, contas a pagar): 1 min depois do start e a cada hora
  if (env.NODE_ENV !== "test") agendarAlertas();
});
