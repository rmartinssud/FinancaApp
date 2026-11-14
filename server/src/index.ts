import { createApp } from "./app.js";
import { env } from "./env.js";
import { agendarEfetivacao } from "./services/autoEfetivar.js";
import { agendarAlertas } from "./services/alertas/motor.js";
import { agendarLimpezaWhatsApp } from "./services/whatsapp/bot.js";
import { whatsappConfig } from "./env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
  // Efetivação automática de receitas/despesas vencidas (no start e a cada hora)
  if (env.NODE_ENV !== "test") agendarEfetivacao();
  // Alertas por e-mail (orçamento, fatura, contas a pagar): 1 min depois do start e a cada hora
  if (env.NODE_ENV !== "test") agendarAlertas();
  // WhatsApp: limpa ids de mensagens antigas, rascunhos e códigos vencidos
  if (env.NODE_ENV !== "test" && whatsappConfig()) agendarLimpezaWhatsApp();
  console.log(whatsappConfig() ? "💬 WhatsApp ligado (webhook em /api/whatsapp/webhook)" : "💬 WhatsApp desligado (faltam WHATSAPP_*)");
});
