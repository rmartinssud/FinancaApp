import { Link } from "react-router-dom";
import { FaCircleCheck } from "react-icons/fa6";
import logo from "../assets/logo-famicash.webp";
import { Destaque } from "../components/SectionTitle.jsx";

// Moldura das telas de login/cadastro: painel da marca à esquerda (desktop)
// e o cartão do formulário à direita, com as "bolhas" desfocadas no fundo.
function AuthLayout({ titulo, subtitulo, children }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-soft font-body">
      {/* Bolhas decorativas */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sky-300/50 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 h-80 w-96 rounded-full bg-accent/40 blur-[100px]" />

      {/* Painel da marca: só em telas grandes */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary-light p-12 text-white lg:flex">
        <div aria-hidden="true" className="absolute -right-20 top-24 h-72 w-72 rounded-full bg-sky-300/40 blur-[100px]" />
        <Link to="/" className="relative inline-flex w-fit rounded-2xl bg-white px-4 py-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
          <img src={logo} alt="Famicash - voltar ao início" className="w-40" />
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-heading text-4xl font-bold leading-tight xl:text-5xl">
            O dinheiro da <Destaque claro>família</Destaque> organizado em um só lugar
          </h2>
          <ul className="mt-8 space-y-4 text-lg text-white/90">
            {["Receitas e despesas em segundos", "Toda a família no mesmo app", "Login seguro com verificação em duas etapas"].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <FaCircleCheck aria-hidden="true" className="shrink-0 text-sky-200" /> {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/70">© {new Date().getFullYear()} Famicash</p>
      </aside>

      {/* Área do formulário */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <Link to="/" className="mb-8 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 lg:hidden">
          <img src={logo} alt="Famicash - voltar ao início" className="w-44" />
        </Link>

        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.25)] sm:p-10">
          <h1 className="font-heading text-3xl font-bold text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-slate-600">{subtitulo}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
