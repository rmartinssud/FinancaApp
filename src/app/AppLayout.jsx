import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { FaArrowRightFromBracket } from "react-icons/fa6";
import logo from "../assets/logo-financas.webp";
import { signOut } from "../lib/auth-client.js";

// Estrutura da área logada: barra superior com menu e botão Sair
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-soft font-body">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-sky-300/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-96 rounded-full bg-accent/30 blur-[100px]" />

      <header className="sticky top-0 z-40 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link to="/app" className="rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            <img src={logo} alt="Finanças Pessoais - início do app" className="w-32 sm:w-36" />
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            <nav aria-label="Menu do app" className="flex gap-1">
              <NavLink to="/app" end className={itemMenu}>
                Início
              </NavLink>
              <NavLink to="/app/seguranca" className={itemMenu}>
                Segurança
              </NavLink>
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

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}

export default AppLayout;
