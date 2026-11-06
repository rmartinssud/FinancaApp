import { CheckCircleFill } from "react-bootstrap-icons";
import { FaBolt, FaHeadset } from "react-icons/fa6";
import img from "../img/mulher_segurando_cartao_credito.png";
import FormularioEmail from "./FormularioEmail.jsx";

const beneficios = ["Eliminando as dívidas", "Controlando o orçamento", "Poupando para o futuro"];

function Hero() {
  return (
    <section className="hero-bg relative z-0 overflow-hidden rounded-b-[48px] md:rounded-b-[60px]">
      {/* Bolhas desfocadas de fundo */}
      <div className="absolute -left-52 bottom-0 h-[400px] w-[1000px] translate-y-[30%] rounded-full bg-sky-300 blur-[50px]" />
      <div className="absolute -right-72 -top-40 h-[400px] w-[600px] translate-y-[30%] rounded-full bg-primary blur-[200px]" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 bg-[url('./img/bg-bola.png')] bg-contain bg-right-top bg-no-repeat px-5 pb-48 pt-12 sm:px-8 md:pt-16 lg:grid-cols-2 lg:pb-56">
        <div className="relative z-10 min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#0d5675]">Esteja no controle</p>
          <h1 className="mt-4 font-heading text-5xl font-extrabold leading-[1.05] text-primary-dark drop-shadow-[0_2px_12px_rgba(255,255,255,0.55)] md:text-6xl">
            Melhor app de <br className="hidden sm:block" />
            finanças pessoais
          </h1>

          <ul className="mt-8 space-y-3">
            {beneficios.map((item) => (
              <li key={item} className="flex items-center gap-4 text-lg font-medium text-primary">
                <CheckCircleFill size={20} className="shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <FormularioEmail className="mt-8" />

          <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-primary">
            <span className="flex items-center gap-2">
              <FaBolt /> Chega de surpresas no fim do mês
            </span>
            <span className="flex items-center gap-2">
              <FaHeadset /> Suporte pelo zap
            </span>
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <img
            className="relative w-full max-w-sm sm:max-w-md lg:-mb-56 lg:max-w-xl lg:translate-x-16"
            src={img}
            alt="Mulher segurando cartão de crédito e sorrindo"
          />
        </div>
      </div>
    </section>
  );
}

export default Hero;
