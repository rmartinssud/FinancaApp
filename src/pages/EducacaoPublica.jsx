import { Link } from "react-router-dom";
import logo from "../assets/logo-famicash.webp";
import { useSession } from "../lib/auth-client.js";
import Educacao from "../educacao/Educacao.jsx";
import { classeFoco } from "../educacao/util.js";

// Educação financeira aberta na web (/educacao/...): indexada pelo Google.
function EducacaoPublica({ pagina }) {
  const { data: sessao } = useSession();
  return (
    <div className="flex min-h-screen flex-col bg-soft font-body">
      <header className="sticky top-0 z-40 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-1.5 sm:gap-2 sm:px-4">
          <Link to="/" className={`inline-flex min-h-11 shrink-0 items-center rounded-xl ${classeFoco}`}>
            <img src={logo} alt="Famicash - página inicial" className="w-28 sm:w-32" />
          </Link>
          <Link to="/educacao" className={`hidden min-h-11 items-center rounded-full px-3 text-sm font-bold text-slate-700 hover:bg-soft sm:inline-flex ${classeFoco}`}>
            Educação financeira
          </Link>
          <span className="flex-1" />
          {sessao ? (
            <Link to="/app" className={`inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-bold text-white shadow hover:bg-primary-dark ${classeFoco}`}>
              Ir para o app
            </Link>
          ) : (
            <>
              <Link to="/entrar" className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-primary hover:bg-soft sm:px-4 ${classeFoco}`}>
                Entrar
              </Link>
              <Link to="/cadastro" className={`inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-bold text-white shadow hover:bg-primary-dark ${classeFoco}`}>
                Criar conta
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <div className={pagina === "conteudo" ? "mx-auto max-w-3xl" : ""}>
          <Educacao pagina={pagina} base="/educacao" />
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Famicash · Finanças da família, inclusive pelo WhatsApp.</p>
          <nav aria-label="Links do rodapé" className="flex flex-wrap gap-x-4">
            <Link to="/" className={`inline-flex min-h-11 items-center rounded hover:text-primary ${classeFoco}`}>
              Conheça o Famicash
            </Link>
            <Link to="/ajuda" className={`inline-flex min-h-11 items-center rounded hover:text-primary ${classeFoco}`}>
              Central de Ajuda
            </Link>
            <Link to="/privacidade" className={`inline-flex min-h-11 items-center rounded hover:text-primary ${classeFoco}`}>
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default EducacaoPublica;
