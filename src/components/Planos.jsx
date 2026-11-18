import { CheckCircleFill } from "react-bootstrap-icons";
import ButtonArrow45 from "./ButtonArrow45.jsx";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";
import { DIAS_TESTE, PLANOS as planos, preco } from "../lib/planos.js";

// Planos e preços: src/lib/planos.js (os mesmos números do servidor)
function Planos() {
  return (
    <section id="planos" className="py-20 md:py-28">
      <Container>
        <SectionTitle subtitulo="Planos" antes="Escolha o plano ideal para" destaque="sua casa" centralizado className="max-w-3xl" />
        <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
          Toda conta nova começa com <strong>{DIAS_TESTE} dias grátis do plano Família</strong>. Depois, continue no Grátis ou escolha um plano. No plano anual você economiza.
        </p>

        <div className="mx-auto mt-14 grid max-w-xl items-stretch gap-8 lg:max-w-none lg:grid-cols-3">
          {planos.map((p) => (
            <article
              key={p.id}
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
                <span className="font-heading text-5xl font-extrabold">{preco(p.precoAnual)}</span>
                <span className={p.destaque ? "text-white/80" : "text-slate-500"}> {p.precoAnual ? "/ano" : "para sempre"}</span>
              </p>
              <p className={`mt-2 text-sm ${p.destaque ? "text-white/80" : "text-slate-500"}`}>
                {p.precoMensal ? `ou ${preco(p.precoMensal)}/mês` : "Sem cartão de crédito"}
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
                texto={p.precoAnual ? `Testar ${DIAS_TESTE} dias grátis` : "Começar grátis"}
                to="/cadastro"
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
