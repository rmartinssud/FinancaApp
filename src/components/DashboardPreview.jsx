import { FaArrowTrendUp, FaArrowTrendDown } from "react-icons/fa6";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";

// Dados de exemplo para o gráfico de rosca (percentuais somam 100)
const categorias = [
  { nome: "Moradia", pct: 35, cor: "#464fa3" },
  { nome: "Mercado", pct: 25, cor: "#2ca9bc" },
  { nome: "Transporte", pct: 15, cor: "#737dd9" },
  { nome: "Lazer", pct: 10, cor: "#7dd3fc" },
  { nome: "Outros", pct: 15, cor: "#cbd5e1" },
];

// Receitas x despesas dos últimos meses (em R$)
const meses = [
  { mes: "Jun", receita: 4800, despesa: 4300 },
  { mes: "Jul", receita: 4800, despesa: 4650 },
  { mes: "Ago", receita: 5000, despesa: 4100 },
  { mes: "Set", receita: 5000, despesa: 3900 },
  { mes: "Out", receita: 5200, despesa: 3700 },
  { mes: "Nov", receita: 5200, despesa: 3117 },
];
const maior = Math.max(...meses.map((m) => m.receita));

// Gráfico de rosca em SVG puro: cada fatia é um círculo com stroke-dasharray.
// O raio 15.915 dá uma circunferência de 100, então "pct" vira o tamanho direto.
function Rosca() {
  let acumulado = 0;
  return (
    <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Gastos por categoria">
      {categorias.map((c) => {
        const fatia = (
          <circle
            key={c.nome}
            cx="21"
            cy="21"
            r="15.915"
            fill="none"
            stroke={c.cor}
            strokeWidth="6"
            strokeDasharray={`${c.pct} ${100 - c.pct}`}
            strokeDashoffset={-acumulado}
          />
        );
        acumulado += c.pct;
        return fatia;
      })}
    </svg>
  );
}

function DashboardPreview() {
  return (
    <section id="dashboard" className="px-3 sm:px-6">
      <div className="relative mx-auto max-w-[1460px] overflow-hidden rounded-[48px] bg-soft py-20 md:py-24">
        <div className="absolute -left-40 top-10 h-[400px] w-[600px] rounded-full bg-sky-200 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[400px] w-[600px] rounded-full bg-primary/60 blur-[150px]" />

        <Container className="relative grid items-center gap-14 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SectionTitle subtitulo="Dashboard" antes="Veja para onde vai" destaque="cada real" />
            <p className="mt-6 text-lg text-slate-600">
              Saldo, gastos por categoria e a evolução de receitas e despesas mês a mês, tudo em uma tela. Os gráficos
              mostram onde dá para economizar.
            </p>
          </div>

          {/* Card do dashboard (dados fictícios) */}
          <div className="rounded-[28px] bg-white p-6 drop-shadow-xl sm:p-8 lg:col-span-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Saldo de novembro</p>
                <p className="font-heading text-4xl font-extrabold text-slate-900">R$ 2.082,90</p>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                  <FaArrowTrendUp aria-hidden="true" /> R$ 5.200
                </span>
                <span className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700">
                  <FaArrowTrendDown aria-hidden="true" /> R$ 3.117
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {/* Rosca + legenda */}
              <div>
                <p className="mb-4 font-medium text-slate-700">Gastos por categoria</p>
                <div className="flex items-center gap-6">
                  <Rosca />
                  <ul className="space-y-1.5 text-sm">
                    {categorias.map((c) => (
                      <li key={c.nome} className="flex items-center gap-2 text-slate-600">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.cor }} />
                        {c.nome} <span className="font-medium text-slate-900">{c.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Barras: receita x despesa */}
              <div>
                <p className="mb-4 font-medium text-slate-700">Receitas x despesas</p>
                <div className="flex h-36 items-end justify-between gap-2">
                  {meses.map((m) => (
                    <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-28 w-full items-end justify-center gap-1">
                        <div className="w-1/3 rounded-t bg-primary" style={{ height: `${(m.receita / maior) * 100}%` }} />
                        <div className="w-1/3 rounded-t bg-accent" style={{ height: `${(m.despesa / maior) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{m.mes}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Receitas</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Despesas</span>
                </div>
              </div>
            </div>

            <p className="mt-8 rounded-2xl bg-soft p-4 text-sm text-primary">
              💡 Suas despesas caíram 16% desde outubro. Que tal mandar R$ 500 para a reserva de emergência?
            </p>
          </div>
        </Container>
      </div>
    </section>
  );
}

export default DashboardPreview;
