import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Cliente do login. Ele chama /api/auth/... no mesmo endereço do site
// (no dev, o Vite repassa /api para o servidor na porta 3333).
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
