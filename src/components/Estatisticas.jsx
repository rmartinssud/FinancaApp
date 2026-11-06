import CountUp from "react-countup";
import ramosDireito from "../img/ramos-direito.png";
import ramosEsquerdo from "../img/ramos-esquerdo.png";
import Container from "./Container.jsx";
import { Destaque } from "./SectionTitle.jsx";

// Números de exemplo (placeholder) até termos dados reais.
// enableScrollSpy faz o número contar quando aparece na tela.
const numeros = [
  { rotulo: "Famílias organizadas", fim: 10, prefixo: "+", sufixo: " mil" },
  { rotulo: "Organizados por mês", fim: 2, prefixo: "R$ ", sufixo: " mi" },
  { rotulo: "De avaliação", fim: 4.9, decimais: 1 },
];

function Estatisticas() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <div className="grid gap-10 sm:grid-cols-3">
          {numeros.map((n) => (
            <div key={n.rotulo} className="flex items-center justify-center gap-3">
              <img className="h-[65px] w-[30px]" src={ramosEsquerdo} alt="" />
              <div className="text-center">
                <span className="block font-heading text-sm uppercase text-zinc-500">{n.rotulo}</span>
                <span className="block whitespace-nowrap text-5xl font-extrabold text-accent lg:text-6xl">
                  <CountUp
                    end={n.fim}
                    duration={2.5}
                    decimals={n.decimais || 0}
                    decimal=","
                    prefix={n.prefixo || ""}
                    suffix={n.sufixo || ""}
                    enableScrollSpy
                    scrollSpyOnce
                  />
                </span>
              </div>
              <img className="h-[65px] w-[30px]" src={ramosDireito} alt="" />
            </div>
          ))}
        </div>

        <p className="mx-auto mt-14 max-w-4xl text-center font-heading text-3xl leading-tight text-slate-900 md:text-5xl">
          Receitas, despesas, cartões e dívidas da família em um só lugar, de um jeito{" "}
          <strong>
            <Destaque>simples</Destaque>
          </strong>{" "}
          e sem planilha.
        </p>
      </Container>
    </section>
  );
}

export default Estatisticas;
