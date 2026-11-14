import { useRef } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useSession } from "../lib/auth-client.js";
import { caminhoSeguro } from "../lib/voltar.js";

// Tela de carregamento simples enquanto a sessão é consultada
export function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

// Mostra o "Carregando" só na primeira consulta da sessão. Nas próximas
// (o Better Auth reconsulta após login/2FA), a tela continua montada e não perde o que foi digitado.
function usePrimeiraCarga() {
  const { data: sessao, isPending } = useSession();
  const jaCarregou = useRef(false);
  if (!isPending) jaCarregou.current = true;
  return { sessao, carregando: isPending && !jaCarregou.current };
}

// Só mostra a página se o usuário estiver logado. Senão, manda para /entrar.
export function RotaProtegida({ children }) {
  const { sessao, carregando } = usePrimeiraCarga();
  const location = useLocation();

  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: location.pathname }} />;
  return children;
}

// O contrário: telas de login/cadastro não aparecem para quem já entrou
// (já logado e com ?voltar=/educacao/...: vai direto para lá)
export function SomenteVisitante({ children }) {
  const { sessao, carregando } = usePrimeiraCarga();
  const [params] = useSearchParams();
  if (carregando) return <Carregando />;
  if (sessao) return <Navigate to={caminhoSeguro(params.get("voltar")) ?? "/app"} replace />;
  return children;
}
