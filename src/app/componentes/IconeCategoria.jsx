import { iconeDaCategoria } from "../../lib/icones.js";

// Bolinha com a cor e o ícone da categoria (decorativa: o nome aparece em texto ao lado)
function IconeCategoria({ categoria, tamanho = "h-11 w-11 text-lg" }) {
  const Icone = iconeDaCategoria(categoria?.icon);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-2xl text-white ${tamanho}`}
      style={{ backgroundColor: categoria?.color ?? "#94a3b8" }}
    >
      <Icone />
    </span>
  );
}

export default IconeCategoria;
