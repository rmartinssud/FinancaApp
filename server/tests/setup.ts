import { execSync } from "node:child_process";
import { config } from "dotenv";

// Antes dos testes: zera o banco de teste e aplica as migrations
export default function setup() {
  const env = config({ path: ".env.test", processEnv: {} }).parsed ?? {};
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}
