import { FaWallet, FaArrowRightArrowLeft, FaPeopleRoof, FaWhatsapp, FaHandHoldingDollar, FaChartPie } from "react-icons/fa6";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";

const funcionalidades = [
  {
    icone: FaWallet,
    titulo: "Carteira, contas e cartões",
    texto: "Cadastre o dinheiro da carteira, suas contas bancárias e cartões de crédito e veja o saldo de cada um.",
  },
  {
    icone: FaArrowRightArrowLeft,
    titulo: "Receitas e despesas fáceis",
    texto: "Lance entradas e saídas em poucos toques, com categorias prontas e parcelas do cartão calculadas.",
  },
  {
    icone: FaPeopleRoof,
    titulo: "Família conectada",
    texto: "Convide quem mora com você. Cada membro registra os próprios gastos e todos veem o mesmo orçamento.",
  },
  {
    icone: FaWhatsapp,
    titulo: "Assistente no WhatsApp",
    texto: "Mande “gastei 45 no mercado” e pronto: o assistente registra, confirma e manda o resumo do mês.",
  },
  {
    icone: FaHandHoldingDollar,
    titulo: "Planejador de dívidas",
    texto: "Monte um plano para quitar suas dívidas e o app agenda os pagamentos assim que você confirmar.",
  },
  {
    icone: FaChartPie,
    titulo: "Dashboard com gráficos",
    texto: "Gráficos simples mostram para onde vai o dinheiro, com dicas para melhorar a saúde financeira.",
  },
];

function Funcionalidades() {
  return (
    <section id="funcionalidades" className="py-20 md:py-28">
      <Container>
        <SectionTitle
          subtitulo="Funcionalidades"
          antes="Tudo o que sua família precisa para"
          destaque="organizar"
          depois="o dinheiro"
          centralizado
          className="max-w-3xl"
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {funcionalidades.map(({ icone: Icone, titulo, texto }) => (
            <article
              key={titulo}
              className="group rounded-[28px] bg-white p-8 drop-shadow-xl transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-soft text-2xl text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <Icone aria-hidden="true" />
              </div>
              <h3 className="mt-6 font-heading text-xl font-bold text-slate-900">{titulo}</h3>
              <p className="mt-3 text-slate-600">{texto}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default Funcionalidades;
