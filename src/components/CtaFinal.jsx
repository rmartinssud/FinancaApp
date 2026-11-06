import FormularioEmail from "./FormularioEmail.jsx";
import SectionTitle from "./SectionTitle.jsx";

// Faixa final de chamada para ação (fundo degradê índigo)
function CtaFinal() {
  return (
    <section id="contato" className="px-3 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[48px] bg-gradient-to-br from-primary to-primary-light px-6 py-16 text-center md:rounded-[60px] md:py-20">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-sky-300/50 blur-[100px]" />
        <div className="absolute -bottom-24 -right-10 h-72 w-96 rounded-full bg-accent/50 blur-[100px]" />

        <div className="relative">
          <SectionTitle antes="Pronto para cuidar do" destaque="seu dinheiro" depois="em família?" claro centralizado className="max-w-3xl" />
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/85">
            Deixe seu email e seja avisado assim que o app abrir. Os primeiros cadastrados ganham 3 meses do plano Família.
          </p>
          <FormularioEmail textoBotao="Quero acesso" placeholder="Seu email" className="mx-auto mt-10" />
        </div>
      </div>
    </section>
  );
}

export default CtaFinal;
