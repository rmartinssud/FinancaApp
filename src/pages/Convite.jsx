import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AuthLayout from "../auth/AuthLayout.jsx";
import Alerta from "../auth/Alerta.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import { Carregando } from "../auth/RotaProtegida.jsx";
import { useSession } from "../lib/auth-client.js";
import { api } from "../lib/api.js";
import { CHAVE_CONVITE } from "../lib/convite.js";
import { NOME_PAPEL } from "../lib/pessoas.js";

const linkClasse = "font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 rounded";

// /convite/:token — mostra o espaço e quem convidou.
// Logado: botão "Entrar no espaço". Sem login: entrar ou criar conta e voltar aqui.
function Convite() {
  const { token } = useParams();
  const { data: sessao, isPending } = useSession();
  const [convite, setConvite] = useState(null);
  const [erro, setErro] = useState("");
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    api(`/invites/${token}`)
      .then(setConvite)
      .catch((e) => setErro(e.message));
  }, [token]);

  // Logado: o convite já está na tela, não precisa mais ficar guardado
  useEffect(() => {
    if (sessao) localStorage.removeItem(CHAVE_CONVITE);
  }, [sessao]);

  async function aceitar() {
    setAceitando(true);
    setErro("");
    try {
      await api(`/invites/${token}/accept`, { method: "POST" });
      // Recarrega para abrir o app já no espaço novo
      window.location.assign("/app");
    } catch (falha) {
      setErro(falha.message);
      setAceitando(false);
    }
  }

  const guardar = () => localStorage.setItem(CHAVE_CONVITE, token);

  if (isPending || (!convite && !erro)) return <Carregando />;

  if (!convite) {
    return (
      <AuthLayout titulo="Convite" subtitulo="Não foi possível abrir este convite.">
        <Alerta>{erro}</Alerta>
        <p className="mt-6 text-center">
          <Link to={sessao ? "/app" : "/entrar"} className={linkClasse}>
            {sessao ? "Ir para o app" : "Entrar na minha conta"}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={convite.householdName} subtitulo={`${convite.invitedBy} convidou você para este espaço.`}>
      <Alerta>{erro}</Alerta>
      <div className="mt-4 rounded-2xl bg-soft p-4 text-primary-dark">
        <p>
          Seu papel: <strong>{NOME_PAPEL[convite.role]}</strong>
        </p>
        <p className="mt-1 text-sm">
          Você continua com o seu espaço Pessoal. Dá para trocar de espaço pelo menu, a qualquer hora.
        </p>
      </div>

      {sessao ? (
        <BotaoEnviar type="button" texto="Entrar no espaço" textoCarregando="Entrando..." carregando={aceitando} onClick={aceitar} className="mt-6 w-full" />
      ) : (
        <div className="mt-6 space-y-3">
          <Link
            to="/entrar"
            state={{ de: `/convite/${token}` }}
            onClick={guardar}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 font-bold text-white transition hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Já tenho conta: entrar
          </Link>
          <Link
            to="/cadastro"
            onClick={guardar}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-soft px-6 font-bold text-primary transition hover:bg-primary hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Criar conta grátis
          </Link>
          <p className="text-center text-sm text-slate-500">Depois de entrar, você volta para este convite.</p>
        </div>
      )}
    </AuthLayout>
  );
}

export default Convite;
