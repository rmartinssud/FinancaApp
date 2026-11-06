import { FaMoneyBillTransfer, FaListOl, FaPiggyBank } from "react-icons/fa6";
import ButtonArrow45 from "./ButtonArrow45.jsx";
import Container from "./Container.jsx";

// Conteúdo dos 3 cards (fica mais fácil editar aqui do que no JSX)
const cards = [
  {
    icone: FaMoneyBillTransfer,
    etiqueta: "Eliminando as dívidas",
    titulo: "Pague suas dívidas",
    texto: "Eliminar dívidas traz uma sensação de liberdade e paz de espírito.",
    itens: ["Estabeleça um orçamento", "Priorize os pagamentos", "Negocie com credores", "Evite novas dívidas"],
  },
  {
    icone: FaListOl,
    etiqueta: "Controlando o orçamento",
    titulo: "Estabeleça limites",
    texto: "Cumprir um orçamento traz a satisfação de estar no controle das suas finanças e alcançar suas metas.",
    itens: ["O orçamento é um mapa", "Registre cada gasto", "Revise regularmente", "Estabeleça metas"],
  },
  {
    icone: FaPiggyBank,
    etiqueta: "Poupando para o futuro",
    titulo: "Viver previdente",
    texto: "Poupar para o futuro traz a satisfação de construir segurança e realizar sonhos.",
    itens: ["Comece hoje", "Tenha um objetivo", "Consistência é chave", "Invista na sua paz"],
  },
];

function TresCards() {
  return (
    <Container className="relative z-10 -mt-32 lg:-mt-40">
      <div className="grid gap-10 rounded-3xl bg-white px-6 py-10 drop-shadow-xl sm:px-10 lg:grid-cols-3 lg:gap-0 lg:py-14">
        {cards.map(({ icone: Icone, etiqueta, titulo, texto, itens }, i) => (
          <div
            key={titulo}
            className={`flex h-full flex-col items-start lg:px-8 ${i < cards.length - 1 ? "border-b border-slate-200 pb-10 lg:border-b-0 lg:border-r-2 lg:pb-0" : ""} ${i === 0 ? "lg:pl-0" : ""}`}
          >
            <div className="flex items-center gap-2 text-primary">
              <Icone aria-hidden="true" />
              <span>{etiqueta}</span>
            </div>
            <h3 className="mt-3 font-heading text-2xl font-bold lg:text-3xl">{titulo}</h3>
            <p className="mt-4 text-sm text-slate-600">{texto}</p>
            <ul className="lista-bolinha ml-5 mt-3 leading-9">
              {itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <ButtonArrow45 texto="Saiba Mais" href="#funcionalidades" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

export default TresCards;
