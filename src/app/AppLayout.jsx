import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  FaArrowRightFromBracket,
  FaHouse,
  FaRightLeft,
  FaWallet,
  FaTags,
  FaShieldHalved,
} from "react-icons/fa6";
import logo from "../assets/logo-financas.webp";
import { signOut } from "../lib/auth-client.js";

// Itens do menu do app (o mesmo menu aparece no topo no computador e embaixo no celular)
const menu = [
  { para: "/app", texto: "Início", Icone: FaHouse, fim: true },
  { para: "/app/lancamentos", texto: "Lançamentos", Icone: FaRightLeft },
  { para: "/app/contas", texto: "Contas", Icone: FaWallet },
  { para: "/app/categorias", texto: "Categorias", Icone: FaTags },
  { para: "/app/seguranca", texto: "Segurança", Icone: FaShieldHalved },
];

// Estrutura da área logada: barra superior com logo e Sair,
// menu no topo (telas grandes) ou fixo embaixo (celular).
function AppLayout({ children }) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await signOut();
    // Recarrega a página para limpar qualquer dado da sessão guardado na memória
    window.location.replace("/entrar");
  }

  const itemMenu = ({ isActive }) =>
    `inline-flex min-h-11 items-center rounded-full px-4 font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
      isActive ? "bg-soft text-primary" : "text-slate-600 hover:text-primary"
    }`;

  const itemMenuBaixo = ({ isActive }) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
      isActive ? "bg-soft text-primary" : "text-slate-600"
    }`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-soft font-body">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-sky-300/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-96 rounded-full bg-accent/30 blur-[100px]" />

      <header className="sticky top-0 z-40 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-8 sm:py-3">
          <Link to="/app" className="inline-flex min-h-11 items-center rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            <img src={logo} alt="Finanças Pessoais - início do app" className="w-28 sm:w-36" />
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            <nav aria-label="Menu do app" className="hidden gap-1 lg:flex">
              {menu.map(({ para, texto, fim }) => (
                <NavLink key={para} to={para} end={fim} className={itemMenu}>
                  {texto}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={sair}
              disabled={saindo}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 px-4 font-bold text-primary transition hover:bg-primary hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"
            >
              <FaArrowRightFromBracket aria-hidden="true" />
              <span>{saindo ? "Saindo..." : "Sair"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-40 pt-6 sm:px-8 sm:pt-10 lg:pb-32">{children}</main>

      {/* Menu fixo embaixo (celular e tablet): fácil de alcançar com o polegar */}
      <nav
        aria-label="Menu do app"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-xl gap-1">
          {menu.map(({ para, texto, Icone, fim }) => (
            <NavLink key={para} to={para} end={fim} className={itemMenuBaixo}>
              <Icone aria-hidden="true" className="text-lg" />
              <span>{texto}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default AppLayout;
