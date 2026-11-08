// Botões de escolha única (ex.: Despesa / Receita). São radios nativos,
// então funcionam com teclado (setas) e leitor de tela.
function Alternador({ legenda, nome, opcoes, valor, onMudar, esconderLegenda = false, className = "" }) {
  return (
    <fieldset className={className}>
      <legend className={esconderLegenda ? "sr-only" : "mb-2 block font-medium text-slate-800"}>{legenda}</legend>
      <div className="flex gap-1 rounded-full bg-soft p-1">
        {opcoes.map((o) => (
          <label key={o.valor} className="flex-1">
            <input
              type="radio"
              name={nome}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => onMudar(o.valor)}
              className="peer sr-only"
            />
            <span
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-center font-bold transition peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${
                valor === o.valor ? o.classeAtiva ?? "bg-primary text-white shadow" : "text-slate-600 hover:text-primary"
              }`}
            >
              {o.texto}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default Alternador;
