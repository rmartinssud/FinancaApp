import { Link } from "react-router-dom";
import logo from "../assets/logo-famicash.webp";
import CentralAjuda from "../ajuda/CentralAjuda.jsx";

const classeFoco = "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Central de Ajuda aberta, sem login (/ajuda e /ajuda/:slug): os mesmos artigos do app.
function AjudaPublica() {
  return (
    <div className="min-h-screen bg-soft font-body">
      <header className="sticky top-0 z-40 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-1.5 sm:px-4">
          <Link to="/" className={`inline-flex min-h-11 items-center rounded-xl ${classeFoco}`}>
            <img src={logo} alt="Famicash - página inicial" className="w-32" />
          </Link>
          <span className="flex-1" />
          <Link to="/entrar" className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-primary hover:bg-soft ${classeFoco}`}>
            Entrar
          </Link>
          <Link to="/cadastro" className={`inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-bold text-white shadow hover:bg-primary-dark ${classeFoco}`}>
            Criar conta
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <CentralAjuda base="/ajuda" />
      </main>
    </div>
  );
}

export default AjudaPublica;
