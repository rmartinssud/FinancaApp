import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Os testes usam o banco do .env.test (nunca o de desenvolvimento)
const testEnv = config({ path: ".env.test", override: false, processEnv: {} }).parsed ?? {};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ["./tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
