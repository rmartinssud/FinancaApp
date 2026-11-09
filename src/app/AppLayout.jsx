import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CHAVE_CONVITE } from "../lib/convite.js";
import { FaBars } from "react-icons/fa6";
import logo from "../assets/logo-financas.webp";
import { signOut } from "../lib/auth-client.js";
import { useMe } from "./useMe.js";
import MenuLateral from "./componentes/MenuLateral.jsx";
import NovoLancamento from "./componentes/NovoLancamento.jsx";

// Estrutura da área logada:
// - computador (lg+): menu fixo na lateral esquerda;
// - celular/tablet: barra no topo com o botão ☰ que abre o menu como gaveta (da esquerda, com fundo escuro).
// O botão redondo "+" (novo lançamento) fica no canto de baixo à direita.
// onLancamentoSalvo: a tela recarrega os dados quando alguém salva pelo botão "+".
// barraInferior: barra fixa embaixo da tela (ex.: filtros de Lançamentos); o botão "+" sobe para ficar acima dela.
function AppLayout({ children, onLancamentoSalvo, semBotaoNovo = false, barraInferior = null }) {
  const { me, podeEditar } = useMe();
  const [saindo, setSaindo] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const botaoMenu = useRef(null);
  const gaveta = useRef(null);
  const idTitulo = useId();
  const location = useLocation();
  const navigate = useNavigate();

  // Abriu um convite sem estar logado: depois de entrar (ou confirmar o cadastro), volta para ele
  useEffect(() => {
    const token = localStorage.getItem(CHAVE_CONVITE);
    if (token) {
      localStorage.removeItem(CHAVE_CONVITE);
      navigate(`/convite/${token}`, { replace: true });
    }
  }, [navigate]);

  async function sair() {
    setSaindo(true);
    await signOut();
    // Recarrega a página para limpar qualquer dado da sessão guardado na memória
    window.location.replace("/entrar");
  }

  // Fecha a gaveta ao trocar de tela
  useEffect(() => {
    setGavetaAberta(false);
  }, [location.pathname]);

  // Gaveta aberta: Esc fecha, a página de trás não rola e o foco vai para dentro dela
  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e) => {
      if (e.key === "Escape") setGavetaAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    gaveta.current?.querySelector("a, button")?.focus();
    const botao = botaoMenu.current;
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      botao?.focus();
    };
  }, [gavetaAberta]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-soft font-body">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-sky-300/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-96 rounded-full bg-accent/30 blur-[100px]" />

      {/* Computador: menu lateral fixo */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200/70 bg-white lg:block">
        <MenuLateral me={me} onSair={sair} saindo={saindo} />
      </aside>

      {/* Celular e tablet: barra superior com o botão do menu */}
      <header className="sticky top-0 z-40 bg-white/95 shadow-sm backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-2 py-1.5 sm:px-4">
          <button
            ref={botaoMenu}
            type="button"
            onClick={() => setGavetaAberta(true)}
            aria-label="Abrir menu"
            aria-expanded={gavetaAberta}
            aria-controls="gaveta-menu"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full text-xl text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          >
            <FaBars aria-hidden="true" />
          </button>
          <Link to="/app" className="inline-flex min-h-11 items-center rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
            <img src={logo} alt="Finanças Pessoais - início do app" className="w-28" />
          </Link>
        </div>
      </header>

      {/* Gaveta do menu (celular/tablet) */}
      <div className="lg:hidden">
        <div
          aria-hidden="true"
          onClick={() => setGavetaAberta(false)}
          className={`fixed inset-0 z-[60] bg-slate-900/50 transition-opacity duration-300 motion-reduce:transition-none ${
            gavetaAberta ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <div
          id="gaveta-menu"
          ref={gaveta}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          inert={gavetaAberta ? undefined : ""}
          className={`fixed inset-y-0 left-0 z-[61] w-[85vw] max-w-[330px] overflow-hidden rounded-r-3xl bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            gavetaAberta ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <MenuLateral me={me} onSair={sair} saindo={saindo} idTitulo={idTitulo} />
        </div>
      </div>

      <main className={`relative mx-auto max-w-6xl px-4 ${barraInferior ? "pb-48" : "pb-32"} pt-6 sm:px-8 sm:pt-10 lg:ml-72 lg:mr-0 lg:max-w-none lg:px-10 xl:px-14`}>
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {barraInferior}

      {podeEditar && !semBotaoNovo && <NovoLancamento onSalvo={onLancamentoSalvo} acimaDaBarra={Boolean(barraInferior)} />}
    </div>
  );
}

export default AppLayout;
