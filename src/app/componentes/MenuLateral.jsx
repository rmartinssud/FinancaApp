import { Link, NavLink } from "react-router-dom";
import {
  FaTableCellsLarge,
  FaBuildingColumns,
  FaMoneyBillTransfer,
  FaCreditCard,
  FaPercent,
  FaBullseye,
  FaMagnifyingGlassChart,
  FaChartPie,
  FaShapes,
  FaCalendarDays,
  FaChevronRight,
  FaArrowRightFromBracket,
  FaUsers,
} from "react-icons/fa6";
import logo from "../../assets/logo-financas.webp";
import SeletorEspaco from "./SeletorEspaco.jsx";
import { iniciais } from "../../lib/pessoas.js";

// Itens do menu. "emBreve" aparece desativado com o selo "Em breve".
const SECOES_MENU = [
  {
    itens: [
      { para: "/app", texto: "Resumo", Icone: FaTableCellsLarge, fim: true },
      { para: "/app/contas", texto: "Contas", Icone: FaBuildingColumns },
      { para: "/app/lancamentos", texto: "Lançamentos", Icone: FaMoneyBillTransfer },
      { para: "/app/cartoes", texto: "Cartões de crédito", Icone: FaCreditCard },
      { para: "/app/familia", texto: "Família", Icone: FaUsers },
    ],
  },
  {
    titulo: "Planejar",
    itens: [
      { para: "/app/orcamentos", texto: "Orçamentos", Icone: FaPercent },
      { texto: "Objetivos", Icone: FaBullseye, emBreve: true },
    ],
  },
  {
    titulo: "Analisar",
    itens: [
      { texto: "Relatórios", Icone: FaMagnifyingGlassChart, emBreve: true },
      { texto: "Gráficos", Icone: FaChartPie, emBreve: true },
      { para: "/app/categorias", texto: "Categorias", Icone: FaShapes },
      { texto: "Calendário", Icone: FaCalendarDays, emBreve: true },
    ],
  },
];

const classeItem = "flex min-h-12 w-full items-center gap-4 rounded-full px-5 text-[15px] font-medium transition";

// Conteúdo do menu (o mesmo na barra lateral do computador e na gaveta do celular)
function MenuLateral({ me, onSair, saindo, idTitulo }) {
  const nome = me?.user.name ?? "";
  const email = me?.user.email ?? "";

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-5">
        <Link to="/app" className="inline-flex min-h-11 items-center rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
          <img src={logo} alt="Finanças Pessoais - início do app" className="w-32" />
        </Link>
      </div>

      {/* Cabeçalho com o usuário: leva para perfil e segurança */}
      <Link
        to="/app/seguranca"
        className="mx-3 flex items-center gap-3 rounded-3xl p-3 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        aria-label={`Perfil e segurança de ${nome || "usuário"}`}
      >
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-soft bg-gradient-to-br from-primary to-primary-light font-heading text-lg font-bold text-white">
          {me ? iniciais(nome) : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span id={idTitulo} className="block truncate font-bold text-slate-900">
            {nome || "..."}
          </span>
          <span className="block truncate text-sm text-slate-500">{email}</span>
          <span className="mt-1.5 inline-flex items-center rounded-full border border-slate-300 px-3 py-0.5 text-xs font-bold text-slate-700">Gratuito</span>
        </span>
        <FaChevronRight aria-hidden="true" className="shrink-0 text-slate-400" />
      </Link>

      {/* Espaço ativo (Pessoal, Família...) e troca de espaço */}
      <div className="mt-2">
        <SeletorEspaco me={me} />
      </div>

      <nav aria-label="Menu do app" className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
        {SECOES_MENU.map((secao, i) => (
          <div key={secao.titulo ?? i} className={i > 0 ? "mt-4" : ""}>
            {secao.titulo && <p className="px-5 pb-1 pt-2 text-sm font-bold text-slate-500">{secao.titulo}</p>}
            <ul className="space-y-0.5">
              {secao.itens.map(({ para, texto, Icone, fim, emBreve }) => (
                <li key={texto}>
                  {emBreve ? (
                    <span aria-disabled="true" className={`${classeItem} cursor-not-allowed text-slate-400`}>
                      <Icone aria-hidden="true" className="shrink-0 text-lg" />
                      <span className="flex-1">{texto}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Em breve</span>
                    </span>
                  ) : (
                    <NavLink
                      to={para}
                      end={fim}
                      className={({ isActive }) =>
                        `${classeItem} focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                          isActive ? "bg-soft font-bold text-primary-dark" : "text-slate-700 hover:bg-slate-100"
                        }`
                      }
                    >
                      <Icone aria-hidden="true" className="shrink-0 text-lg" />
                      <span className="flex-1">{texto}</span>
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onSair}
            disabled={saindo}
            className={`${classeItem} text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60`}
          >
            <FaArrowRightFromBracket aria-hidden="true" className="shrink-0 text-lg" />
            <span>{saindo ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default MenuLateral;
