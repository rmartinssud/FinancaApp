import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaEnvelopeOpenText } from "react-icons/fa6";
import AuthLayout from "../auth/AuthLayout.jsx";
import Alerta from "../auth/Alerta.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import { authClient, useSession } from "../lib/auth-client.js";

const linkClasse = "rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Esta tela tem 3 situações:
// 1) logo após o cadastro (?enviado=1): "confira seu email"
// 2) o link do email deu certo: o servidor confirma e redireciona para cá já logado
// 3) o link falhou (?error=...): mostra o erro e permite reenviar
function VerificarEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const erro = params.get("error");
  const { data: sessao, isPending } = useSession();
  const [reenviado, setReenviado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function reenviar() {
    if (!email) return;
    setCarregando(true);
    await authClient.sendVerificationEmail({ email, callbackURL: "/verificar-email" });
    setCarregando(false);
    setReenviado(true);
  }

  if (params.get("enviado")) {
    return (
      <AuthLayout titulo="Confira seu email">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-soft text-2xl text-primary">
          <FaEnvelopeOpenText aria-hidden="true" />
        </div>
        <p className="text-slate-700">
          Enviamos um link de confirmação para <strong className="break-all">{email || "o seu email"}</strong>. Clique nele para ativar sua conta.
        </p>
        {reenviado && <Alerta tipo="sucesso" className="mt-6">Link reenviado!</Alerta>}
        {email && !reenviado && (
          <BotaoEnviar type="button" variante="light" texto="Reenviar link" textoCarregando="Enviando..." carregando={carregando} onClick={reenviar} className="mt-8 w-full" />
        )}
        <p className="mt-8 text-center">
          <Link to="/entrar" className={linkClasse}>
            Ir para o login
          </Link>
        </p>
      </AuthLayout>
    );
  }

  if (erro) {
    return (
      <AuthLayout titulo="Não foi possível confirmar">
        <Alerta>Este link é inválido ou expirou. Entre com seu email e senha para receber um novo link.</Alerta>
        <p className="mt-8 text-center">
          <Link to="/entrar" className={linkClasse}>
            Ir para o login
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={isPending ? "Confirmando..." : "Email confirmado!"}>
      {!isPending && (
        <>
          <Alerta tipo="sucesso">Sua conta está ativa. Bem-vindo(a) ao Finanças Pessoais!</Alerta>
          <Link
            to={sessao ? "/app" : "/entrar"}
            className="group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-3 font-bold text-white hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            {sessao ? "Ir para o app" : "Entrar"}
          </Link>
        </>
      )}
    </AuthLayout>
  );
}

export default VerificarEmail;
