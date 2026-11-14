import { Link } from "react-router-dom";
import logo from "../assets/logo-famicash.webp";
import Markdown from "../ajuda/Markdown.jsx";
import texto from "../legal/privacidade.md?raw";

const classeFoco = "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

// Política de Privacidade pública (/privacidade). Também é a URL informada ao Meta (app do WhatsApp).
function Privacidade() {
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
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-8">
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Política de Privacidade</h1>
          <div className="mt-4">
            <Markdown texto={texto} base="/ajuda" />
          </div>
        </article>
      </main>
    </div>
  );
}

export default Privacidade;
