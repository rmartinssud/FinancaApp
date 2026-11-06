import { FaArrowRight } from "react-icons/fa6";

// Botão "pílula" com seta. A seta começa inclinada (-45°) e gira para 0°
// quando o mouse passa por cima do botão (classe "group" + "group-hover").
const variantes = {
  primary: "bg-primary text-white",
  light: "bg-white text-primary",
};

function ButtonArrow45({
  texto,
  variante = "primary",
  type = "button",
  href,
  onClick,
  className = "",
}) {
  const classes = `group inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-full px-6 py-3 font-bold transition-shadow hover:shadow-lg ${variantes[variante]} ${className}`;

  const conteudo = (
    <>
      {texto}
      <FaArrowRight
        aria-hidden="true"
        className="-rotate-45 transition-transform duration-300 group-hover:rotate-0"
      />
    </>
  );

  // Se receber href vira link (<a>), senão é um <button>
  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {conteudo}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {conteudo}
    </button>
  );
}

export default ButtonArrow45;
