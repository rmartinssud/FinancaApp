import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FaShieldHalved, FaCircleCheck } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { authClient, useSession } from "../lib/auth-client.js";
import { traduzirErro } from "../lib/erros.js";

const cartao = "rounded-3xl bg-white p-6 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:p-8";

// Lista dos códigos de backup (cada um só pode ser usado uma vez)
function CodigosBackup({ codigos }) {
  return (
    <div className="mt-6">
      <h3 className="font-bold text-slate-900">Códigos de backup</h3>
      <p className="mt-1 text-sm text-slate-600">Guarde em lugar seguro. Use um deles se perder o celular. Cada código funciona uma vez.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3" aria-label="Códigos de backup">
        {codigos.map((c) => (
          <li key={c} className="rounded-xl bg-soft px-3 py-2 text-center text-primary-dark">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tela para ligar/desligar a verificação em duas etapas (TOTP)
function Seguranca() {
  const { data: sessao, refetch } = useSession();
  const ativo = Boolean(sessao?.user.twoFactorEnabled);

  // etapa: "inicio" -> "qrcode" (escaneia e confirma) -> "pronto" (mostra códigos)
  const [etapa, setEtapa] = useState("inicio");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [codigosBackup, setCodigosBackup] = useState([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  const segredo = totpURI ? new URL(totpURI).searchParams.get("secret") : "";

  async function comecar(e) {
    e.preventDefault();
    if (!senha) return setErro("Digite sua senha para continuar.");
    setErro("");
    setCarregando(true);
    const { data, error } = await authClient.twoFactor.enable({ password: senha });
    setCarregando(false);
    if (error) return setErro(traduzirErro(error));
    setTotpURI(data.totpURI);
    setCodigosBackup(data.backupCodes);
    setSenha("");
    setEtapa("qrcode");
  }

  async function confirmar(e) {
    e.preventDefault();
    const limpo = codigo.replace(/\s/g, "");
    if (limpo.length !== 6) return setErro("O código tem 6 dígitos.");
    setErro("");
    setCarregando(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: limpo });
    setCarregando(false);
    if (error) return setErro(traduzirErro(error));
    setCodigo("");
    await refetch();
    setEtapa("pronto");
  }

  async function desativar(e) {
    e.preventDefault();
    if (!senha) return setErro("Digite sua senha para desativar.");
    setErro("");
    setCarregando(true);
    const { error } = await authClient.twoFactor.disable({ password: senha });
    setCarregando(false);
    if (error) return setErro(traduzirErro(error));
    setSenha("");
    setAviso("Verificação em duas etapas desativada.");
    setEtapa("inicio");
    await refetch();
  }

  async function novosCodigos() {
    if (!senha) return setErro("Digite sua senha para gerar novos códigos.");
    setErro("");
    setCarregando(true);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: senha });
    setCarregando(false);
    if (error) return setErro(traduzirErro(error));
    setSenha("");
    setCodigosBackup(data.backupCodes);
    setEtapa("pronto");
  }

  return (
    <AppLayout>
      <p className="text-sm font-bold uppercase tracking-widest text-primary">Conta</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-slate-900 md:text-4xl">Segurança</h1>

      <section className={`mt-8 max-w-2xl ${cartao}`} aria-labelledby="titulo-2fa">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-xl text-primary">
            <FaShieldHalved aria-hidden="true" />
          </span>
          <div>
            <h2 id="titulo-2fa" className="font-heading text-2xl font-bold text-slate-900">
              Verificação em duas etapas
            </h2>
            <p className="mt-1 text-slate-600">Além da senha, o login pede um código do app autenticador (Google Authenticator, Authy, 1Password...).</p>
            <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {ativo && <FaCircleCheck aria-hidden="true" />} {ativo ? "Ativada" : "Desativada"}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <Alerta>{erro}</Alerta>
          <Alerta tipo="sucesso">{aviso}</Alerta>

          {/* Desligado: pede a senha para começar */}
          {!ativo && etapa === "inicio" && (
            <form onSubmit={comecar} noValidate className="space-y-5">
              <Campo label="Sua senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
              <BotaoEnviar texto="Ativar verificação" textoCarregando="Gerando..." carregando={carregando} />
            </form>
          )}

          {/* Mostra o QR code e pede o primeiro código */}
          {etapa === "qrcode" && (
            <form onSubmit={confirmar} noValidate className="space-y-5">
              <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                <li>Abra o app autenticador no celular.</li>
                <li>Escaneie o QR code abaixo.</li>
                <li>Digite o código de 6 dígitos que aparecer.</li>
              </ol>
              <div className="flex flex-col items-center gap-4 rounded-3xl bg-soft p-6 sm:flex-row sm:items-center">
                <div className="rounded-2xl bg-white p-3">
                  <QRCodeSVG value={totpURI} size={176} fgColor="#363d85" title="QR code para o app autenticador" />
                </div>
                <div className="min-w-0 text-sm text-slate-700">
                  <p>Não consegue escanear? Digite esta chave no app:</p>
                  <p className="mt-2 break-all rounded-xl bg-white px-3 py-2 font-mono text-primary-dark" data-testid="segredo-totp">
                    {segredo}
                  </p>
                </div>
              </div>
              <Campo label="Código de 6 dígitos" value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              <div className="flex flex-wrap gap-3">
                <BotaoEnviar texto="Confirmar e ativar" textoCarregando="Confirmando..." carregando={carregando} />
                <button type="button" onClick={() => setEtapa("inicio")} className="min-h-12 rounded-full px-5 font-bold text-slate-600 hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Recém ativado (ou códigos novos): mostra os códigos de backup */}
          {etapa === "pronto" && (
            <>
              <Alerta tipo="sucesso">Pronto! Sua conta agora pede o código do app ao entrar.</Alerta>
              <CodigosBackup codigos={codigosBackup} />
            </>
          )}

          {/* Ligado: pode desativar ou gerar novos códigos de backup */}
          {ativo && etapa !== "qrcode" && (
            <form onSubmit={desativar} noValidate className="space-y-5 border-t border-slate-100 pt-6">
              <Campo label="Sua senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" dica="Necessária para desativar ou gerar novos códigos." />
              <div className="flex flex-wrap gap-3">
                <BotaoEnviar type="button" variante="light" texto="Gerar novos códigos" carregando={carregando} onClick={novosCodigos} />
                <BotaoEnviar variante="perigo" texto="Desativar" textoCarregando="Desativando..." carregando={carregando} />
              </div>
            </form>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

export default Seguranca;
