import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaCrown, FaCircleCheck, FaTicket } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import { cartao, botaoSecundario } from "./componentes/estilos.js";
import { esquecerMe } from "./useMe.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson } from "../lib/api.js";
import { PLANOS, preco } from "../lib/planos.js";

// Meu plano: plano do espaço ativo, uso (medidores), tabela de planos e resgate de cupom.
// Pagamento ainda não existe: "Assinar" avisa para usar um cupom.

const ORIGEM = { TESTE: "Teste grátis", CUPOM: "Cupom", PAGO: "Assinatura", GRATIS: "Plano grátis" };
const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const tamanho = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : `${Math.round(b / 1024 ** 2).toLocaleString("pt-BR")} MB`);

function Medidor({ rotulo, usado, limite, formatar = (n) => n.toLocaleString("pt-BR") }) {
  const ilimitado = limite == null;
  const pct = ilimitado ? 0 : Math.min(100, Math.round((usado / Math.max(limite, 1)) * 100));
  const cheio = !ilimitado && usado >= limite;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-800">{rotulo}</span>
        <span className={`text-sm ${cheio ? "font-bold text-red-700" : "text-slate-600"}`}>
          {formatar(usado)} {ilimitado ? "(ilimitado)" : `de ${formatar(limite)}`}
        </span>
      </div>
      {!ilimitado && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={rotulo} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${cheio ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </li>
  );
}

function MeuPlano() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [resgatando, setResgatando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [avisoAssinar, setAvisoAssinar] = useState("");

  useEffect(() => {
    api("/plano")
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  async function resgatar(e) {
    e.preventDefault();
    if (!codigo.trim()) return setErro("Digite o código do cupom.");
    setErro("");
    setAviso("");
    setResgatando(true);
    try {
      const r = await api("/plano/cupom", enviarJson("POST", { code: codigo.trim() }));
      setDados((d) => ({ ...d, ...r }));
      setAviso(`Cupom aplicado! Seu espaço está no plano ${r.redeemed.plan} até ${data(r.redeemed.endsAt)}.`);
      setCodigo("");
      esquecerMe();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setResgatando(false);
    }
  }

  const plano = dados?.plan;
  const u = dados?.usage;

  return (
    <AppLayout semBotaoNovo>
      <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Meu plano</h1>
      <p className="mt-1 text-slate-600">
        O plano vale para o espaço <strong>{dados?.household.name ?? "..."}</strong> e é do dono do espaço. <Link to="/app/ajuda/planos" className="font-bold text-primary underline">Saiba mais</Link>
      </p>

      <Alerta className="mt-4">{erro}</Alerta>
      <Alerta tipo="sucesso" className="mt-4">{aviso}</Alerta>

      {!dados && !erro && <p role="status" className="mt-6 text-slate-500">Carregando...</p>}

      {dados && (
        <>
          <section className={`${cartao} mt-6`} aria-labelledby="plano-atual">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-xl text-primary">
                <FaCrown />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="plano-atual" className="font-heading text-xl font-bold text-slate-900">
                  Plano {plano.name}
                </h2>
                <p className="text-slate-600">
                  {ORIGEM[plano.source]}
                  {plano.endsAt && ` até ${data(plano.endsAt)}`}
                  {plano.source === "TESTE" && ". Depois, o espaço volta para o Grátis (nada é apagado)."}
                </p>
              </div>
            </div>

            <ul className="mt-6 space-y-4">
              <Medidor rotulo="Contas" usado={u.accounts.used} limite={u.accounts.limit} />
              <Medidor rotulo="Cartões" usado={u.cards.used} limite={u.cards.limit} />
              <Medidor rotulo="Dívidas ativas" usado={u.debts.used} limite={u.debts.limit} />
              <Medidor rotulo="Objetivos ativos" usado={u.goals.used} limite={u.goals.limit} />
              <Medidor rotulo="Pessoas (com convites pendentes)" usado={u.people.used} limite={u.people.limit} />
              <Medidor rotulo="Mensagens do assistente neste mês" usado={u.aiMessages.used} limite={u.aiMessages.limit} />
              <Medidor rotulo="Anexos" usado={u.storage.used} limite={u.storage.limit} formatar={tamanho} />
            </ul>
            <p className="mt-4 text-sm text-slate-500">
              Passou do limite? Nada é apagado: só não dá para criar itens novos até liberar espaço ou mudar de plano. As mensagens do assistente renovam no dia 1º.
              {plano.voice ? " Respostas em áudio no WhatsApp: incluídas." : " Respostas em áudio no WhatsApp: só no Família+."}
            </p>
          </section>

          <section className={`${cartao} mt-6`} aria-labelledby="titulo-cupom">
            <h2 id="titulo-cupom" className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900">
              <FaTicket aria-hidden="true" className="text-primary" /> Tenho um cupom
            </h2>
            {dados.canManage ? (
              <form onSubmit={resgatar} noValidate className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <Campo label="Código do cupom" className="flex-1" autoComplete="off" maxLength={40} placeholder="Ex.: FUNDADOR" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
                <BotaoEnviar texto="Usar cupom" carregando={resgatando} textoCarregando="Aplicando..." />
              </form>
            ) : (
              <p className="mt-2 text-slate-600">Só o dono do espaço pode usar um cupom.</p>
            )}
          </section>

          <section className="mt-8" aria-labelledby="titulo-planos">
            <h2 id="titulo-planos" className="font-heading text-xl font-bold text-slate-900">Planos</h2>
            <Alerta tipo="info" className="mt-4">{avisoAssinar}</Alerta>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {PLANOS.map((p) => {
                const atual = p.id === plano.id;
                return (
                  <article key={p.id} className={`${cartao} flex flex-col ${atual ? "ring-2 ring-primary" : ""}`}>
                    <h3 className="font-heading text-lg font-bold text-slate-900">
                      {p.nome}
                      {atual && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-xs font-bold text-primary">Atual</span>}
                    </h3>
                    <p className="mt-2">
                      <span className="font-heading text-3xl font-extrabold text-slate-900">{preco(p.precoAnual)}</span>
                      <span className="text-slate-500"> {p.precoAnual ? "/ano" : "para sempre"}</span>
                    </p>
                    {p.precoMensal > 0 && <p className="text-sm text-slate-500">ou {preco(p.precoMensal)}/mês</p>}
                    <ul className="mb-6 mt-4 space-y-2 text-sm text-slate-700">
                      {p.itens.map((i) => (
                        <li key={i} className="flex gap-2">
                          <FaCircleCheck aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                          {i}
                        </li>
                      ))}
                    </ul>
                    {p.precoAnual > 0 && (
                      <button type="button" className={`${botaoSecundario} mt-auto`} onClick={() => setAvisoAssinar("Pagamento em breve — use um cupom.")}>
                        Assinar {p.nome}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </AppLayout>
  );
}

export default MeuPlano;
