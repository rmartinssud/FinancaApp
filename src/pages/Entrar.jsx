import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../auth/AuthLayout.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import BotaoGoogle from "../auth/BotaoGoogle.jsx";
import { authClient, signIn } from "../lib/auth-client.js";
import { traduzirErro, emailValido } from "../lib/erros.js";

const linkClasse = "rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

function Entrar() {
  const navigate = useNavigate();
  const location = useLocation();
  const destino = location.state?.de ?? "/app";

  // Etapa 1: email e senha. Etapa 2: código do app autenticador (se o 2FA estiver ligado)
  const [etapa, setEtapa] = useState("senha");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [usarBackup, setUsarBackup] = useState(false);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    const novosErros = {};
    if (!emailValido(email)) novosErros.email = "Digite um email válido.";
    if (!senha) novosErros.senha = "Digite sua senha.";
    setErros(novosErros);
    setErroGeral("");
    if (Object.keys(novosErros).length) return;

    setCarregando(true);
    const { data, error } = await signIn.email({ email, password: senha });
    setCarregando(false);

    if (error) return setErroGeral(traduzirErro(error));
    if (data?.twoFactorRedirect) return setEtapa("codigo");
    navigate(destino, { replace: true });
  }

  async function verificarCodigo(e) {
    e.preventDefault();
    const limpo = codigo.trim();
    if (!limpo) return setErros({ codigo: "Digite o código." });
    setErros({});
    setErroGeral("");

    setCarregando(true);
    const { error } = usarBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: limpo })
      : await authClient.twoFactor.verifyTotp({ code: limpo.replace(/\s/g, "") });
    setCarregando(false);

    if (error) return setErroGeral(traduzirErro(error));
    // Recarrega a página no app para ler a sessão nova do zero
    window.location.replace(destino);
  }

  if (etapa === "codigo") {
    return (
      <AuthLayout
        titulo="Verificação em duas etapas"
        subtitulo={usarBackup ? "Digite um dos seus códigos de backup." : "Abra seu app autenticador e digite o código de 6 dígitos."}
      >
        <form onSubmit={verificarCodigo} noValidate className="space-y-5">
          <Alerta>{erroGeral}</Alerta>
          <Campo
            label={usarBackup ? "Código de backup" : "Código de 6 dígitos"}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            erro={erros.codigo}
            inputMode={usarBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={usarBackup ? 20 : 6}
            autoFocus
          />
          <BotaoEnviar texto="Confirmar" carregando={carregando} className="w-full" />
        </form>
        <button
          type="button"
          onClick={() => {
            setUsarBackup(!usarBackup);
            setCodigo("");
            setErroGeral("");
          }}
          className={`mt-6 min-h-11 ${linkClasse}`}
        >
          {usarBackup ? "Usar o app autenticador" : "Perdeu o celular? Use um código de backup"}
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo="Entrar" subtitulo="Que bom ver você de novo! Acesse as finanças da sua família.">
      <form onSubmit={entrar} noValidate className="space-y-5">
        <Alerta>{erroGeral}</Alerta>
        <Campo label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.email} autoComplete="email" />
        <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} erro={erros.senha} autoComplete="current-password" />
        <div className="flex justify-end">
          <Link to="/esqueci-senha" className={`inline-flex min-h-11 items-center text-sm ${linkClasse}`}>
            Esqueci minha senha
          </Link>
        </div>
        <BotaoEnviar texto="Entrar" textoCarregando="Entrando..." carregando={carregando} className="w-full" />
      </form>

      <BotaoGoogle />

      <p className="mt-8 text-center text-slate-600">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" className={linkClasse}>
          Criar conta grátis
        </Link>
      </p>
    </AuthLayout>
  );
}

export default Entrar;
