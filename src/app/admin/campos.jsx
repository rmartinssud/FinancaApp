import { useId, useRef, useState } from "react";
import { FaBold, FaHeading, FaItalic, FaLink, FaListUl, FaListOl, FaLightbulb } from "react-icons/fa6";
import Markdown from "../../ajuda/Markdown.jsx";
import { classeFoco } from "../../educacao/util.js";

// ─────────────────────────────────────────────
// Campos do painel da Educação financeira (rótulo em cima, borda arredondada)
// ─────────────────────────────────────────────

export const classeEntrada =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400";

export const botaoPrimario = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-bold text-white shadow transition hover:bg-primary-dark disabled:opacity-60 ${classeFoco}`;
export const botaoClaro = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/30 px-5 font-bold text-primary transition hover:bg-soft disabled:opacity-60 ${classeFoco}`;
export const botaoPerigo = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 px-5 font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60 ${classeFoco}`;

export function Campo({ rotulo, erro, dica, contador, children, id: idFixo }) {
  const gerado = useId();
  const id = idFixo ?? gerado;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-bold text-slate-700">
          {rotulo}
        </label>
        {contador}
      </div>
      <div className="mt-1.5">{children({ id, "aria-invalid": erro ? "true" : undefined, "aria-describedby": erro || dica ? `${id}-info` : undefined })}</div>
      {(erro || dica) && (
        <p id={`${id}-info`} className={`mt-1 text-sm ${erro ? "text-red-600" : "text-slate-500"}`}>
          {erro || dica}
        </p>
      )}
    </div>
  );
}

export function Contador({ valor, max }) {
  const n = String(valor ?? "").length;
  return <span className={`text-xs ${n > max ? "font-bold text-red-600" : "text-slate-400"}`}>{`${n}/${max}`}</span>;
}

// Escolha entre poucas opções (rádio com cara de botão)
export function Opcoes({ rotulo, valor, onMudar, opcoes, nome }) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-700">{rotulo}</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/30 ${
              valor === o.valor ? "border-primary bg-soft" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <input type="radio" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => onMudar(o.valor)} className="mt-1 accent-primary" />
            <span>
              <span className="block font-bold text-slate-900">{o.texto}</span>
              {o.dica && <span className="block text-sm text-slate-500">{o.dica}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Caixa({ marcado, onMudar, texto, dica }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-2">
      <input type="checkbox" checked={marcado} onChange={(e) => onMudar(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
      <span>
        <span className="block font-bold text-slate-900">{texto}</span>
        {dica && <span className="block text-sm text-slate-500">{dica}</span>}
      </span>
    </label>
  );
}

// Editor de Markdown com botões e prévia (a prévia usa o mesmo renderizador da página pública,
// que gera elementos React e nunca HTML cru: nada de script ou HTML colado passa)
export function EditorMarkdown({ rotulo, valor, onMudar, erro, base = "/educacao", linhas = 16 }) {
  const id = useId();
  const area = useRef(null);
  const [aba, setAba] = useState("escrever");

  function envolver(antes, depois = antes, exemplo = "texto") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: ini, selectionEnd: fim } = el;
    const selecionado = valor.slice(ini, fim) || exemplo;
    const novo = valor.slice(0, ini) + antes + selecionado + depois + valor.slice(fim);
    onMudar(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + antes.length, ini + antes.length + selecionado.length);
    });
  }
  function linha(prefixo, exemplo) {
    const el = area.current;
    if (!el) return;
    const ini = el.selectionStart;
    const comeco = valor.lastIndexOf("\n", ini - 1) + 1;
    const precisaQuebra = comeco > 0 && valor.slice(comeco - 2, comeco) !== "\n\n" ? "\n" : "";
    const resto = valor.slice(comeco);
    const novo = valor.slice(0, comeco) + precisaQuebra + prefixo + (resto.trim() ? resto : exemplo);
    onMudar(novo);
    requestAnimationFrame(() => el.focus());
  }

  const botoes = [
    { rotulo: "Título", Icone: FaHeading, acao: () => linha("## ", "Título da seção") },
    { rotulo: "Negrito", Icone: FaBold, acao: () => envolver("**") },
    { rotulo: "Itálico", Icone: FaItalic, acao: () => envolver("*") },
    { rotulo: "Lista", Icone: FaListUl, acao: () => linha("- ", "item") },
    { rotulo: "Lista numerada", Icone: FaListOl, acao: () => linha("1. ", "primeiro passo") },
    { rotulo: "Dica (destaque)", Icone: FaLightbulb, acao: () => linha("> ", "Dica importante") },
    { rotulo: "Link", Icone: FaLink, acao: () => envolver("[", "](https://)", "texto do link") },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-slate-700">
          {rotulo}
        </label>
        <div role="tablist" aria-label="Modo do editor" className="inline-flex rounded-full bg-slate-100 p-1">
          {[
            ["escrever", "Escrever"],
            ["previa", "Prévia"],
          ].map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={`min-h-9 rounded-full px-4 text-sm font-bold ${classeFoco} ${aba === v ? "bg-white text-primary shadow" : "text-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {aba === "escrever" ? (
        <div className="mt-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20">
          <div role="toolbar" aria-label="Formatação" className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1">
            {botoes.map(({ rotulo: r, Icone, acao }) => (
              <button key={r} type="button" onClick={acao} title={r} aria-label={r} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white hover:text-primary ${classeFoco}`}>
                <Icone aria-hidden="true" />
              </button>
            ))}
          </div>
          <textarea
            id={id}
            ref={area}
            value={valor}
            onChange={(e) => onMudar(e.target.value)}
            rows={linhas}
            aria-invalid={erro ? "true" : undefined}
            className="block w-full resize-y border-0 px-4 py-3 font-mono text-[14px] leading-relaxed text-slate-900 focus:outline-none"
            placeholder={"## Título da seção\n\nEscreva o texto aqui. Use **negrito**, listas com - e dicas com >."}
          />
        </div>
      ) : (
        <div className="mt-1.5 min-h-40 rounded-2xl border border-slate-200 bg-white p-4">
          {valor.trim() ? <Markdown texto={valor} base={base} /> : <p className="text-slate-500">Nada para mostrar ainda.</p>}
        </div>
      )}
      <p className={`mt-1 text-sm ${erro ? "text-red-600" : "text-slate-500"}`}>
        {erro || "## título · **negrito** · *itálico* · - lista · 1. lista numerada · > dica · [texto](https://link) · [outro artigo](/educacao/endereco)"}
      </p>
    </div>
  );
}
