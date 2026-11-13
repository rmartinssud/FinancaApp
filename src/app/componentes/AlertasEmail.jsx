import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaEnvelope } from "react-icons/fa6";
import Interruptor from "./Interruptor.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson } from "../../lib/api.js";

const TIPOS = [
  { chave: "budget", texto: "Orçamentos", descricao: "Quando um orçamento chega ao % de alerta (80% por padrão) e quando passa de 100%." },
  { chave: "invoice", texto: "Fatura do cartão", descricao: "Alguns dias antes do vencimento, com o valor a pagar." },
  { chave: "bills", texto: "Contas a pagar", descricao: "Um resumo por dia das despesas pendentes que vencem hoje ou amanhã." },
];

const DIAS = Array.from({ length: 10 }, (_, i) => i + 1);

// Seção "Alertas por e-mail" (tela Segurança): liga/desliga cada tipo de alerta no espaço ativo.
// Salva na hora a cada mudança.
function AlertasEmail({ className = "" }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let ativo = true;
    api("/me/alerts")
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function mudar(parcial) {
    const anterior = dados.preferences;
    setDados((d) => ({ ...d, preferences: { ...d.preferences, ...parcial } }));
    setErro("");
    setAviso("");
    try {
      const r = await api("/me/alerts", enviarJson("PUT", parcial));
      setDados((d) => ({ ...d, preferences: r.preferences }));
      setAviso("Preferências salvas.");
    } catch (e) {
      setDados((d) => ({ ...d, preferences: anterior }));
      setErro(e.message);
    }
  }

  const p = dados?.preferences;

  return (
    <section id="alertas" className={`scroll-mt-6 ${className}`} aria-labelledby="titulo-alertas">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-xl text-primary">
          <FaEnvelope aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="titulo-alertas" className="font-heading text-xl font-bold text-slate-900 md:text-2xl">
            Alertas por e-mail
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dados ? (
              <>
                Avisos do espaço <strong className="text-slate-800">{dados.household.name}</strong>, enviados para <span className="break-all">{dados.email}</span>.
              </>
            ) : (
              "Avisos importantes no seu e-mail."
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Alerta>{erro}</Alerta>
        <Alerta tipo="sucesso">{aviso}</Alerta>

        {!dados && !erro && <p className="text-sm text-slate-500">Carregando…</p>}

        {dados && !dados.eligible && (
          <Alerta tipo="info">Seu acesso a este espaço é somente leitura, então você não recebe alertas dele.</Alerta>
        )}

        {dados && dados.eligible && (
          <>
            <ul className="divide-y divide-slate-100">
              {TIPOS.map((t) => (
                <li key={t.chave} className="py-3">
                  <Interruptor texto={t.texto} descricao={t.descricao} ligado={p[t.chave]} onMudar={(v) => mudar({ [t.chave]: v })} />
                  {t.chave === "invoice" && p.invoice && (
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                      <span>Avisar</span>
                      <select
                        value={p.invoiceDaysBefore}
                        onChange={(e) => mudar({ invoiceDaysBefore: Number(e.target.value) })}
                        className="min-h-10 rounded-full border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                      >
                        {DIAS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <span>{p.invoiceDaysBefore === 1 ? "dia antes do vencimento" : "dias antes do vencimento"}</span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Os alertas saem entre 7h e 22h (horário de Brasília), uma vez só para cada aviso. As preferências valem para este espaço; para outro, troque de espaço no menu.{" "}
              <Link to="/app/ajuda/alertas-por-email" className="font-bold text-primary hover:underline">
                Saiba mais
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default AlertasEmail;
