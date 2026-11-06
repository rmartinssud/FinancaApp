import { CheckCircleFill } from "react-bootstrap-icons";
import { FaStar } from "react-icons/fa6";
import ButtonArrow45 from "./ButtonArrow45.jsx";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";
import Mulher from "../assets/mulher-usando-o-app-de-financas-pessoais.jpg";

const pontos = ["Planejamento cuidadoso", "Criar uma reserva de emergência", "Controle rigoroso dos gastos"];

// Seção "Sobre": proteção da família + depoimento
function InfoSession() {
  return (
    <section id="sobre" className="py-20 md:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionTitle antes="Proteger sua" destaque="família" depois="das adversidades" />

          <ul className="mt-8 space-y-3">
            {pontos.map((p) => (
              <li key={p} className="flex items-center gap-4 text-lg tracking-wide text-primary">
                <CheckCircleFill size={20} className="shrink-0 text-primary-light" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <ButtonArrow45 texto="Começar agora" href="#planos" />
            <div>
              <div className="flex items-center gap-1 text-yellow-400">
                {[1, 2, 3, 4, 5].map((n) => (
                  <FaStar key={n} aria-hidden="true" />
                ))}
                <span className="ml-1 font-bold text-slate-900">4,9</span>
              </div>
              <span className="text-sm text-slate-500">2,3 mil avaliações</span>
            </div>
          </div>

          {/* Depoimento (pessoa fictícia, avatar com iniciais) */}
          <figure className="mt-12 flex flex-col gap-5 rounded-3xl border border-slate-200 p-6 sm:flex-row sm:items-center sm:p-8">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-soft font-heading text-xl font-bold text-primary ring-2 ring-primary-light"
              aria-hidden="true"
            >
              MS
            </div>
            <div>
              <blockquote className="text-slate-700">
                “Antes eu não sabia para onde ia o salário. Agora meu marido e eu lançamos tudo no app, até pelo
                WhatsApp, e no fim do mês sobra dinheiro para a reserva das crianças.”
              </blockquote>
              <figcaption className="mt-4 text-sm text-slate-500">
                <span className="font-black text-slate-800">Mariana S.</span> · professora, Niterói
              </figcaption>
            </div>
          </figure>
        </div>

        <div className="flex justify-center">
          <img
            src={Mulher}
            alt="Mulher usando o app de finanças pessoais no celular"
            className="max-h-[640px] w-full rounded-2xl border-2 border-slate-300 object-cover"
            loading="lazy"
          />
        </div>
      </Container>
    </section>
  );
}

export default InfoSession;
