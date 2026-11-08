import { useEffect, useRef, useState } from "react";
import { FaPlus, FaMinus, FaArrowsUpDown, FaCreditCard } from "react-icons/fa6";
import FormLancamento from "./FormLancamento.jsx";
import FormDespesaCartao from "./FormDespesaCartao.jsx";

// Opções do menu, na ordem do app de referência
const OPCOES = [
  { tipo: "TRANSFER", texto: "Transferência", Icone: FaArrowsUpDown, cor: "bg-amber-100 text-amber-600" },
  { tipo: "INCOME", texto: "Receita", Icone: FaPlus, cor: "bg-emerald-100 text-emerald-700" },
  { tipo: "EXPENSE", texto: "Despesa", Icone: FaMinus, cor: "bg-red-100 text-red-600" },
  { tipo: "CARD", texto: "Despesa cartão", Icone: FaCreditCard, cor: "bg-blue-100 text-blue-700" },
];

// Fechado: só o círculo de 56px no canto de baixo à direita aparece.
// Aberto: o retângulo inteiro (o menu) aparece. A transição do clip-path faz o
// botão "crescer" a partir do canto (container transform do Material 3).
const RECORTE_FECHADO = "inset(calc(100% - 56px) 0 0 calc(100% - 56px) round 28px)";
const RECORTE_ABERTO = "inset(0 0 0 0 round 20px)";

// Botão redondo "+" que vira o menu de novo lançamento (Transferência, Receita, Despesa, Despesa cartão)
function NovoLancamento({ onSalvo }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(null); // "TRANSFER" | "INCOME" | "EXPENSE" | "CARD"
  const botao = useRef(null);
  const itens = useRef([]);

  // Aberto: Esc fecha e o foco vai para a primeira opção
  useEffect(() => {
    if (!aberto) return;
    itens.current[0]?.focus({ preventScroll: true });
    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    botao.current?.focus({ preventScroll: true });
  }

  function escolher(tipo) {
    setAberto(false);
    setForm(tipo);
  }

  // Setas para cima/baixo andam entre as opções
  function navegar(e, i) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const proximo = (i + (e.key === "ArrowDown" ? 1 : -1) + OPCOES.length) % OPCOES.length;
    itens.current[proximo]?.focus();
  }

  const transicao = "duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

  return (
    <>
      {/* Fundo escuro sobre a tela inteira (inclusive a barra do topo) */}
      <div
        aria-hidden="true"
        onClick={fechar}
        className={`fixed inset-0 z-[45] bg-slate-900/55 transition-opacity ${transicao} ${aberto ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <div
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 w-60 transition-[clip-path,background-color,box-shadow] lg:bottom-8 lg:right-8 ${transicao} ${
          aberto ? "bg-white shadow-2xl" : "bg-primary shadow-[0_12px_30px_-6px_rgba(70,79,163,0.7)]"
        }`}
        style={{ clipPath: aberto ? RECORTE_ABERTO : RECORTE_FECHADO }}
      >
        <ul
          role="menu"
          id="menu-novo-lancamento"
          aria-label="Novo lançamento"
          inert={aberto ? undefined : ""}
          className={`divide-y divide-slate-100 py-1 transition-opacity motion-reduce:transition-none ${
            aberto ? "opacity-100 delay-75 duration-200" : "opacity-0 duration-100"
          }`}
        >
          {OPCOES.map(({ tipo, texto, Icone, cor }, i) => (
            <li key={tipo} role="none">
              <button
                ref={(el) => (itens.current[i] = el)}
                type="button"
                role="menuitem"
                onClick={() => escolher(tipo)}
                onKeyDown={(e) => navegar(e, i)}
                className="flex min-h-[52px] w-full items-center gap-4 px-4 text-left font-medium text-slate-800 transition active:bg-soft focus:outline-none focus-visible:bg-soft [@media(hover:hover)]:hover:bg-soft"
              >
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${cor}`}>
                  <Icone />
                </span>
                {texto}
              </button>
            </li>
          ))}
        </ul>

        {/* O botão "+" ocupa o canto de baixo à direita (a única parte visível quando fechado) */}
        <button
          ref={botao}
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Novo lançamento"
          aria-haspopup="menu"
          aria-expanded={aberto}
          aria-controls="menu-novo-lancamento"
          tabIndex={aberto ? -1 : 0}
          className={`absolute bottom-0 right-0 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white transition-opacity focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/70 motion-reduce:transition-none ${
            aberto ? "pointer-events-none opacity-0 duration-100" : "opacity-100 delay-100 duration-150"
          }`}
        >
          <FaPlus aria-hidden="true" />
        </button>
      </div>

      {form && form !== "CARD" && (
        <FormLancamento
          tipoInicial={form}
          onFechar={() => setForm(null)}
          onSalvo={(salvo) => {
            setForm(null);
            onSalvo?.(salvo);
          }}
        />
      )}
      {form === "CARD" && (
        <FormDespesaCartao
          onFechar={() => setForm(null)}
          onSalvo={(salvo) => {
            setForm(null);
            onSalvo?.(salvo);
          }}
        />
      )}
    </>
  );
}

export default NovoLancamento;
