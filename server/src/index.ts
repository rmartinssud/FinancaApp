import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
});
