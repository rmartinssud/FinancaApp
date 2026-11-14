import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaWhatsapp, FaCircleCheck } from "react-icons/fa6";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";

// Avisa outras seções (ex.: Alertas no WhatsApp) que o número foi ligado/desligado
export const EVENTO_WHATSAPP = "famicash:whatsapp";
const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO_WHATSAPP));

const EXEMPLOS = ["gastei 45,90 mercado", "50 uber ontem", "recebi 1200 salário", "30 no cartão Nubank ifood", "saldo", "resumo"];

const seletor =
  "min-h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";

// Seção "WhatsApp" (tela Segurança): liga o número ao Famicash com um código de 6 dígitos,
// escolhe o espaço padrão do bot e desliga.
function WhatsAppBot({ className = "" }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState({});
  const [aviso, setAviso] = useState("");
  const [telefone, setTelefone] = useState("");
  const [espaco, setEspaco] = useState("");
  const [codigo, setCodigo] = useState(null); // { code, expiresAt, phone, waLink }
  const [carregando, setCarregando] = useState(false);
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await api("/whatsapp/link");
      setDados(d);
      setEspaco((atual) => atual || d.households.find((h) => h.active)?.id || d.households[0]?.id || "");
      return d;
    } catch (e) {
      setErro(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Esperando a mensagem com o código: confere a cada 4 segundos até ligar ou vencer
  useEffect(() => {
    if (!codigo) return;
    const timer = setInterval(async () => {
      if (new Date(codigo.expiresAt) < new Date()) {
        setCodigo(null);
        setErro("O código venceu. Gere outro.");
        return;
      }
      const d = await carregar();
      if (d?.link) {
        setCodigo(null);
        setAviso("Pronto! Seu WhatsApp está ligado ao Famicash.");
        avisarMudanca();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [codigo, carregar]);

  async function gerarCodigo(e) {
    e.preventDefault();
    setErro("");
    setErros({});
    setAviso("");
    if (telefone.replace(/\D/g, "").length < 10) return setErros({ phone: "Digite o número com DDD, ex.: (21) 99999-8888." });
    setCarregando(true);
    try {
      const r = await api("/whatsapp/link", enviarJson("POST", { phone: telefone, householdId: espaco || undefined }));
      setCodigo(r);
    } catch (e2) {
      setErros(errosPorCampo(e2));
      if (!Object.keys(e2.detalhes ?? {}).length) setErro(e2.message);
    } finally {
      setCarregando(false);
    }
  }

  async function mudarEspaco(householdId) {
    setErro("");
    setAviso("");
    try {
      setDados(await api("/whatsapp/link", enviarJson("PUT", { householdId })));
      setAviso("Espaço padrão salvo.");
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desligar() {
    setErro("");
    setAviso("");
    setCarregando(true);
    try {
      await api("/whatsapp/link", { method: "DELETE" });
      setConfirmarDesligar(false);
      setTelefone("");
      await carregar();
      setAviso("WhatsApp desligado.");
      avisarMudanca();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  const link = dados?.link;

  return (
    <section id="whatsapp" className={`scroll-mt-6 ${className}`} aria-labelledby="titulo-whatsapp">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
          <FaWhatsapp aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="titulo-whatsapp" className="font-heading text-xl font-bold text-slate-900 md:text-2xl">
            WhatsApp
          </h2>
          <p className="mt-1 text-sm text-slate-600">Lance gastos e receitas mandando uma mensagem, e veja o saldo e o resumo do mês.</p>
          {link && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
              <FaCircleCheck aria-hidden="true" /> Ligado: <span className="whitespace-nowrap">{link.phone}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Alerta>{erro}</Alerta>
        <Alerta tipo="sucesso">{aviso}</Alerta>

        {!dados && !erro && <p className="text-sm text-slate-500">Carregando…</p>}

        {dados && !dados.enabled && <Alerta tipo="info">O WhatsApp do Famicash chega em breve.</Alerta>}

        {/* Ainda não ligado: número + espaço → código */}
        {dados?.enabled && !link && !codigo && (
          <form onSubmit={gerarCodigo} noValidate className="space-y-4">
            <Campo
              label="Seu número de WhatsApp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(21) 99999-8888"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              erro={erros.phone}
              dica="Com DDD. Números de fora do Brasil: comece com + e o código do país."
            />
            {dados.households.length > 1 && (
              <label className="block">
                <span className="mb-2 block font-medium text-slate-800">Lançar no espaço</span>
                <select value={espaco} onChange={(e) => setEspaco(e.target.value)} className={seletor}>
                  {dados.households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <BotaoEnviar texto="Gerar código" textoCarregando="Gerando..." carregando={carregando} />
          </form>
        )}

        {/* Código gerado: mandar para o bot */}
        {dados?.enabled && !link && codigo && (
          <div className="space-y-4 rounded-3xl bg-soft p-5">
            <p className="text-sm text-slate-700">
              Do número <strong className="whitespace-nowrap">{codigo.phone}</strong>, mande este código para o Famicash no WhatsApp (
              <span className="whitespace-nowrap">{codigo.botNumber}</span>):
            </p>
            <p className="text-center font-mono text-3xl font-bold tracking-[0.3em] text-primary-dark" aria-label={`Código ${codigo.code.split("").join(" ")}`}>
              {codigo.code}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={codigo.waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
              >
                <FaWhatsapp aria-hidden="true" /> Abrir o WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setCodigo(null)}
                className="min-h-12 rounded-full px-5 font-bold text-slate-600 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                Trocar número
              </button>
            </div>
            <p className="text-xs text-slate-500" aria-live="polite">
              Vale por {codigo.validMinutes} minutos. Esta tela atualiza sozinha quando o código chegar.
            </p>
          </div>
        )}

        {/* Ligado: espaço padrão, exemplos e desligar */}
        {dados?.enabled && link && (
          <>
            {!link.household && <Alerta tipo="info">Você não faz mais parte do espaço que o WhatsApp usava. Escolha outro abaixo.</Alerta>}
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Espaço padrão do WhatsApp</span>
              <select value={link.household?.id ?? ""} onChange={(e) => mudarEspaco(e.target.value)} className={seletor}>
                {!link.household && <option value="">Escolha um espaço</option>}
                {dados.households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-sm text-slate-500">É onde o bot lança e de onde vêm o saldo e o resumo.</span>
            </label>

            <div>
              <p className="text-sm font-bold text-slate-800">
                Experimente mandar para <span className="whitespace-nowrap">{dados.botNumber}</span>:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {EXEMPLOS.map((x) => (
                  <li key={x} className="rounded-full bg-soft px-3 py-1 text-sm text-primary-dark">
                    {x}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">O bot mostra um resumo e só lança quando você toca em Confirmar.</p>
            </div>

            {!confirmarDesligar ? (
              <button
                type="button"
                onClick={() => setConfirmarDesligar(true)}
                className="min-h-11 rounded-full px-5 text-sm font-bold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
              >
                Desligar WhatsApp
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">O bot para de responder a este número e os alertas no WhatsApp param. Os lançamentos já feitos continuam.</p>
                <div className="flex flex-wrap gap-3">
                  <BotaoEnviar type="button" variante="perigo" texto="Desligar" textoCarregando="Desligando..." carregando={carregando} onClick={desligar} />
                  <button
                    type="button"
                    onClick={() => setConfirmarDesligar(false)}
                    className="min-h-12 rounded-full px-5 font-bold text-slate-600 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {dados?.enabled && (
          <p className="text-xs text-slate-500">
            <Link to="/app/ajuda/whatsapp" className="font-bold text-primary hover:underline">
              Como usar o WhatsApp
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

export default WhatsAppBot;
