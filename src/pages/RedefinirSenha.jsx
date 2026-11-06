import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "../auth/AuthLayout.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { authClient } from "../lib/auth-client.js";
import { traduzirErro } from "../lib/erros.js";

const linkClasse = "rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// O link do email chega aqui com ?token=... (ou ?error=INVALID_TOKEN se expirou)
function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const erroLink = params.get("error");

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [pronto, setPronto] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    const novos = {};
    if (senha.length < 8) novos.senha = "A senha precisa ter pelo menos 8 caracteres.";
    if (confirmar !== senha) novos.confirmar = "As senhas não são iguais.";
    setErros(novos);
    setErroGeral("");
    if (Object.keys(novos).length) return;

    setCarregando(true);
    const { error } = await authClient.resetPassword({ newPassword: senha, token });
    setCarregando(false);

    if (error) return setErroGeral(traduzirErro(error));
    setPronto(true);
  }

  if (!token || erroLink) {
    return (
      <AuthLayout titulo="Link inválido">
        <Alerta>Este link é inválido ou expirou. Peça um novo para redefinir sua senha.</Alerta>
        <p className="mt-8 text-center">
          <Link to="/esqueci-senha" className={linkClasse}>
            Pedir novo link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo="Criar nova senha" subtitulo="Escolha uma senha forte que você não usa em outros sites.">
      {pronto ? (
        <>
          <Alerta tipo="sucesso">Senha alterada! Por segurança, saímos da sua conta em todos os aparelhos.</Alerta>
          <p className="mt-8 text-center">
            <Link to="/entrar" className={linkClasse}>
              Entrar com a nova senha
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={salvar} noValidate className="space-y-5">
          <Alerta>{erroGeral}</Alerta>
          <Campo label="Nova senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} erro={erros.senha} dica="Mínimo de 8 caracteres." autoComplete="new-password" />
          <Campo label="Confirme a nova senha" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} erro={erros.confirmar} autoComplete="new-password" />
          <BotaoEnviar texto="Salvar nova senha" textoCarregando="Salvando..." carregando={carregando} className="w-full" />
        </form>
      )}
    </AuthLayout>
  );
}

export default RedefinirSenha;
