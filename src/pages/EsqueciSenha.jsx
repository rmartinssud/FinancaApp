import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../auth/AuthLayout.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { authClient } from "../lib/auth-client.js";
import { traduzirErro, emailValido } from "../lib/erros.js";

function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!emailValido(email)) return setErro("Digite um email válido.");
    setErro("");

    setCarregando(true);
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/redefinir-senha" });
    setCarregando(false);

    if (error) return setErro(traduzirErro(error));
    setEnviado(true); // a mensagem é a mesma exista a conta ou não (segurança)
  }

  return (
    <AuthLayout titulo="Esqueci minha senha" subtitulo="Digite seu email e enviaremos um link para criar uma nova senha.">
      {enviado ? (
        <Alerta tipo="sucesso">
          Se existir uma conta com <strong>{email}</strong>, você vai receber o link em instantes. Confira também a caixa de spam.
        </Alerta>
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-5">
          <Campo label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erro} autoComplete="email" />
          <BotaoEnviar texto="Enviar link" textoCarregando="Enviando..." carregando={carregando} className="w-full" />
        </form>
      )}
      <p className="mt-8 text-center">
        <Link to="/entrar" className="rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
          Voltar para o login
        </Link>
      </p>
    </AuthLayout>
  );
}

export default EsqueciSenha;
