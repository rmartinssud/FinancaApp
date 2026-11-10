import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaArrowRight } from "react-icons/fa6";
import Modal from "./Modal.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, formatarReais } from "../../lib/api.js";
import { nomeDoMes } from "../../lib/datas.js";

// "2026-11" -> "nov"
const formatoMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
function mesCurto(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return formatoMesCurto.format(new Date(Date.UTC(ano, m - 1, 15))).replace(".", "");
}

// Valor curto em cima da barra: "R$ 1,2 mil"
const formatoCompacto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

// Janela "Evolução": despesas da categoria nos últimos 6 meses (barras), mês da tela em destaque e a média.
// categoria: { categoryId (null = sem categoria), name, color }
function EvolucaoCategoria({ categoria, mes, linkLancamentos, onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    api(`/summary/category-history?categoryId=${encodeURIComponent(categoria.categoryId ?? "none")}&month=${mes}&months=6`)
      .then((d) => ativo && setDados(d))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [categoria.categoryId, mes]);

  const meses = dados?.months ?? [];
  const media = Number(dados?.average ?? 0);
  const maior = Math.max(media, ...meses.map((m) => Number(m.total)), 0);
  const altura = (v) => (maior > 0 ? (v / maior) * 100 : 0);
  const atual = meses.at(-1);
  const diferenca = atual ? Number(atual.total) - media : 0;
  // Mês da tela na cor cheia; os anteriores mais claros (cor + transparência, sem apagar o rótulo)
  const corBarra = (ehAtual) => (ehAtual ? categoria.color : `${categoria.color}66`);

  return (
    <Modal titulo="Evolução" onFechar={onFechar}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoria.color }} />
        <p className="min-w-0 truncate font-bold text-slate-900">{categoria.name}</p>
        <p className="ml-auto shrink-0 text-sm text-slate-500">Últimos 6 meses</p>
      </div>

      <Alerta>{erro}</Alerta>
      {!dados && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando...
        </p>
      )}

      {dados && (
        <>
          {/* Barras (decorativas): os valores de cada mês estão na tabela para leitor de tela */}
          <div aria-hidden="true" className="relative mt-6 h-44">
            <div className="absolute inset-x-0 bottom-6 top-5 flex items-end gap-2 sm:gap-3">
              {meses.map((m, i) => {
                const valor = Number(m.total);
                const ehAtual = i === meses.length - 1;
                return (
                  <div key={m.month} className="flex h-full min-w-0 flex-1 items-end justify-center">
                    <div
                      className="relative w-full max-w-10 rounded-t-lg transition-[height] duration-300 motion-reduce:transition-none"
                      style={{ height: `${Math.max(altura(valor), valor > 0 ? 3 : 1)}%`, backgroundColor: corBarra(ehAtual) }}
                    >
                      <span
                        className={`absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none ${ehAtual ? "font-bold text-slate-900" : "text-slate-500"}`}
                      >
                        {valor > 0 ? formatoCompacto.format(valor) : "–"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Linha da média */}
              {media > 0 && (
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${altura(media)}%` }} />
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex gap-2 sm:gap-3">
              {meses.map((m, i) => (
                <span key={m.month} className={`flex-1 text-center text-xs ${i === meses.length - 1 ? "font-bold text-slate-900" : "text-slate-500"}`}>
                  {mesCurto(m.month)}
                </span>
              ))}
            </div>
          </div>

          <table className="sr-only">
            <caption>Despesas de {categoria.name} por mês</caption>
            <tbody>
              {meses.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{nomeDoMes(m.month)}</th>
                  <td>{formatarReais(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-soft p-3">
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Neste mês</dt>
              <dd className="mt-1 whitespace-nowrap font-heading text-base font-bold text-slate-900 sm:text-lg">{formatarReais(atual?.total ?? 0)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-slate-400" />
                Média
              </dt>
              <dd className="mt-1 whitespace-nowrap font-heading text-base font-bold text-slate-900 sm:text-lg">{formatarReais(dados.average)}</dd>
            </div>
          </dl>
          {media > 0 && Math.abs(diferenca) >= 0.01 && (
            <p className={`mt-3 text-sm ${diferenca > 0 ? "text-red-700" : "text-emerald-700"}`}>
              <span className="whitespace-nowrap">{formatarReais(Math.abs(diferenca))}</span> {diferenca > 0 ? "acima" : "abaixo"} da média de 6 meses.
            </p>
          )}

          <Link
            to={linkLancamentos}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            Ver lançamentos
            <FaArrowRight aria-hidden="true" className="text-sm" />
          </Link>
        </>
      )}
    </Modal>
  );
}

export default EvolucaoCategoria;
