import { CheckCircleFill } from "react-bootstrap-icons";
import ButtonArrow45 from "./ButtonArrow45.jsx";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";

// ATENÇÃO: nomes, preços e itens dos planos são PLACEHOLDERS (valores provisórios).
// Ajuste quando a precificação estiver definida.
const planos = [
  {
    nome: "Grátis",
    preco: "R$ 0",
    periodo: "para sempre",
    descricao: "Para começar a organizar suas finanças.",
    itens: ["1 usuário", "Carteira e 2 contas", "Receitas e despesas ilimitadas", "Resumo mensal"],
  },
  {
    nome: "Família",
    preco: "R$ 19,90",
    periodo: "/mês",
    descricao: "Para a casa toda registrar junto.",
    itens: ["Até 5 membros da família", "Contas e cartões ilimitados", "Assistente no WhatsApp", "Dashboard com gráficos"],
    destaque: true,
  },
  {
    nome: "Premium",
    preco: "R$ 29,90",
    periodo: "/mês",
    descricao: "Para quem quer sair das dívidas mais rápido.",
    itens: ["Tudo do plano Família", "Planejador de dívidas", "Dicas personalizadas", "Suporte prioritário"],
  },
];

function Planos() {
  return (
    <section id="planos" className="py-20 md:py-28">
      <Container>
        <SectionTitle subtitulo="Planos" antes="Escolha o plano ideal para" destaque="sua casa" centralizado className="max-w-3xl" />

        <div className="mx-auto mt-14 grid max-w-xl items-stretch gap-8 lg:max-w-none lg:grid-cols-3">
          {planos.map((p) => (
            <article
              key={p.nome}
              className={`relative flex flex-col rounded-[28px] p-8 drop-shadow-xl ${p.destaque ? "bg-primary text-white lg:-my-4 lg:py-12" : "bg-white text-slate-800"}`}
            >
              {p.destaque && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-strong px-4 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Mais popular
                </span>
              )}
              <h3 className="font-heading text-2xl font-bold">{p.nome}</h3>
              <p className={`mt-2 ${p.destaque ? "text-white/80" : "text-slate-500"}`}>{p.descricao}</p>
              <p className="mt-6">
                <span className="font-heading text-5xl font-extrabold">{p.preco}</span>
                <span className={p.destaque ? "text-white/80" : "text-slate-500"}> {p.periodo}</span>
              </p>
              <ul className="mb-8 mt-8 space-y-3">
                {p.itens.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircleFill size={18} className={`shrink-0 ${p.destaque ? "text-sky-200" : "text-primary"}`} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <ButtonArrow45
                texto={p.preco === "R$ 0" ? "Começar grátis" : "Assinar"}
                href="#contato"
                variante={p.destaque ? "light" : "primary"}
                className="mt-auto w-full"
              />
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default Planos;
