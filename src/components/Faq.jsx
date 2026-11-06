import { useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";

const perguntas = [
  {
    pergunta: "Meus dados estão seguros?",
    resposta:
      "Sim. Seus dados trafegam com criptografia, o login tem verificação em duas etapas e seguimos a LGPD: você pode baixar ou apagar suas informações quando quiser. Não vendemos seus dados.",
  },
  {
    pergunta: "Como funciona o acesso da família?",
    resposta:
      "Você convida os membros por email. Cada pessoa tem seu próprio login e registra os próprios gastos, e todos acompanham o mesmo orçamento da casa.",
  },
  {
    pergunta: "Preciso instalar algo para usar o assistente no WhatsApp?",
    resposta:
      "Não. Basta salvar o número do assistente e conectar o seu WhatsApp à conta. Depois é só mandar mensagens como “gastei 30 na farmácia”.",
  },
  {
    pergunta: "Quanto custa?",
    resposta:
      "Existe um plano grátis para sempre. Os planos pagos liberam a família conectada, o WhatsApp e o planejador de dívidas, e você pode cancelar quando quiser.",
  },
  {
    pergunta: "O app conecta direto com o meu banco?",
    resposta:
      "Nesta primeira versão os lançamentos são feitos por você, no app ou pelo WhatsApp. Assim você tem controle total e não precisa compartilhar a senha do banco.",
  },
];

function Faq() {
  // Guarda qual pergunta está aberta (null = todas fechadas)
  const [aberta, setAberta] = useState(0);

  return (
    <section id="faq" className="pb-20 md:pb-28">
      <Container className="max-w-4xl">
        <SectionTitle subtitulo="Dúvidas frequentes" antes="Perguntas" destaque="frequentes" centralizado />

        <div className="mt-12 space-y-4">
          {perguntas.map((item, i) => {
            const estaAberta = aberta === i;
            return (
              <div key={item.pergunta} className="rounded-3xl bg-white px-6 drop-shadow-lg sm:px-8">
                <h3>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl py-6 text-left font-heading text-lg font-bold text-slate-900"
                    aria-expanded={estaAberta}
                    aria-controls={`faq-${i}`}
                    onClick={() => setAberta(estaAberta ? null : i)}
                  >
                    {item.pergunta}
                    <FaChevronDown
                      aria-hidden="true"
                      className={`shrink-0 text-primary transition-transform duration-300 ${estaAberta ? "rotate-180" : ""}`}
                    />
                  </button>
                </h3>
                {/* Truque do grid-rows para animar a altura ao abrir/fechar */}
                <div
                  id={`faq-${i}`}
                  className={`grid transition-all duration-300 ${estaAberta ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"}`}
                >
                  <p className="overflow-hidden text-slate-600">{item.resposta}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

export default Faq;
