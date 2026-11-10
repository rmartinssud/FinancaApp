import { formatarReais } from "../../lib/api.js";
import { nomeDoMes } from "../../lib/datas.js";
import { mesCurto, compacto } from "../../lib/graficos.js";

// Barras em CSS puro (sem biblioteca). Os desenhos são decorativos (aria-hidden):
// os números de cada mês ficam numa tabela para leitor de tela.

const VERDE = "#047857";
const VERMELHO = "#dc2626";

// Receitas × despesas por mês (duas barras lado a lado). meses: [{ month, income, expense }]
export function BarrasReceitasDespesas({ meses, destaque }) {
  const maior = Math.max(0, ...meses.flatMap((m) => [Number(m.income), Number(m.expense)]));
  const altura = (v) => (maior > 0 ? Math.max((v / maior) * 100, v > 0 ? 2 : 0) : 0);
  const poucos = meses.length <= 6;
  return (
    <>
      <div aria-hidden="true" className="mt-4">
        <div className="flex h-40 items-end gap-1 border-b border-slate-200 sm:gap-2">
          {meses.map((m) => (
            <div key={m.month} className={`flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 ${m.month === destaque ? "" : "opacity-80"}`}>
              <div className="w-1/2 max-w-5 rounded-t-md" style={{ height: `${altura(Number(m.income))}%`, backgroundColor: VERDE }} />
              <div className="w-1/2 max-w-5 rounded-t-md" style={{ height: `${altura(Number(m.expense))}%`, backgroundColor: VERMELHO }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1 sm:gap-2">
          {meses.map((m, i) => (
            <span
              key={m.month}
              className={`min-w-0 flex-1 truncate text-center text-[11px] ${m.month === destaque ? "font-bold text-slate-900" : "text-slate-500"}`}
            >
              {poucos || i % 2 === meses.length % 2 ? mesCurto(m.month) : ""}
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: VERDE }} />
            Receitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: VERMELHO }} />
            Despesas
          </span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Receitas e despesas por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Receitas</th>
            <th scope="col">Despesas</th>
            <th scope="col">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.month}>
              <th scope="row">{nomeDoMes(m.month)}</th>
              <td>{formatarReais(m.income)}</td>
              <td>{formatarReais(m.expense)}</td>
              <td>{formatarReais(m.balance ?? Number(m.income) - Number(m.expense))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Um valor por mês que pode ser negativo (economia): verde para cima, vermelho para baixo da linha do zero.
// meses: [{ month, valor }]
export function BarrasComSinal({ meses, destaque, media = null, legenda }) {
  const maiorPos = Math.max(0, ...meses.map((m) => m.valor), media ?? 0);
  const maiorNeg = Math.max(0, ...meses.map((m) => -m.valor), media !== null ? -media : 0);
  const total = maiorPos + maiorNeg || 1;
  const zero = (maiorNeg / total) * 100; // % da altura abaixo do zero
  const poucos = meses.length <= 6;
  return (
    <>
      <div aria-hidden="true" className="mt-4">
        <div className="relative h-44">
          <div className="absolute inset-x-0 border-t border-slate-300" style={{ bottom: `${zero}%` }} />
          {media !== null && media !== 0 && (
            <div className="absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${zero + (media / total) * 100}%` }} />
          )}
          <div className="absolute inset-0 flex gap-1 sm:gap-2">
            {meses.map((m) => {
              const h = (Math.abs(m.valor) / total) * 100;
              const positivo = m.valor >= 0;
              return (
                <div key={m.month} className="relative h-full min-w-0 flex-1">
                  <div
                    className={`absolute left-1/2 w-3/4 max-w-8 -translate-x-1/2 ${positivo ? "rounded-t-md" : "rounded-b-md"} ${m.month === destaque ? "" : "opacity-70"}`}
                    style={{
                      height: `${Math.max(h, m.valor !== 0 ? 1.5 : 0)}%`,
                      backgroundColor: positivo ? VERDE : VERMELHO,
                      ...(positivo ? { bottom: `${zero}%` } : { top: `${100 - zero}%` }),
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex gap-1 sm:gap-2">
          {meses.map((m, i) => (
            <span
              key={m.month}
              className={`min-w-0 flex-1 truncate text-center text-[11px] ${m.month === destaque ? "font-bold text-slate-900" : "text-slate-500"}`}
            >
              {poucos || i % 2 === meses.length % 2 ? mesCurto(m.month) : ""}
            </span>
          ))}
        </div>
        {media !== null && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />
            Média {compacto(media)}
          </p>
        )}
      </div>
      <table className="sr-only">
        <caption>{legenda}</caption>
        <tbody>
          {meses.map((m) => (
            <tr key={m.month}>
              <th scope="row">{nomeDoMes(m.month)}</th>
              <td>{formatarReais(m.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Lista com barra horizontal proporcional (por conta, por tag)
export function BarrasHorizontais({ itens, total, vazio = "Nada no período." }) {
  if (!itens.length) return <p className="mt-3 text-slate-500">{vazio}</p>;
  const maior = Math.max(...itens.map((i) => Number(i.total)), 0);
  return (
    <ul className="mt-3 space-y-3">
      {itens.map((i) => {
        const v = Number(i.total);
        const pct = total > 0 ? Math.round((v / total) * 100) : 0;
        return (
          <li key={i.chave}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                {i.icone}
                <span className="truncate">{i.nome}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-bold text-slate-900">
                {formatarReais(i.total)} <span className="font-normal text-slate-500">· {pct}%</span>
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${maior > 0 ? (v / maior) * 100 : 0}%`, backgroundColor: i.cor ?? "#464fa3" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
