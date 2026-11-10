import { createApp } from "./app.js";
import { env } from "./env.js";
import { agendarEfetivacao } from "./services/autoEfetivar.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
  // Efetivação automática de receitas/despesas vencidas (no start e a cada hora)
  if (env.NODE_ENV !== "test") agendarEfetivacao();
});
