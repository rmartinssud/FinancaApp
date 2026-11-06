import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";

const passos = [
  { titulo: "Crie sua conta", texto: "Cadastro rápido e gratuito com seu email. Em menos de 2 minutos você já está dentro." },
  { titulo: "Convide sua família", texto: "Envie um convite para quem divide as contas com você. Cada um tem seu próprio acesso." },
  { titulo: "Registre pelo app ou WhatsApp", texto: "Lance gastos e receitas no app ou mande uma mensagem para o assistente. Simples assim." },
];

function ComoFunciona() {
  return (
    <section id="como-funciona" className="px-3 sm:px-6">
      <div className="relative mx-auto max-w-[1460px] overflow-hidden rounded-[48px] bg-soft py-20 md:py-24">
        <div className="absolute -right-40 -top-20 h-[350px] w-[500px] rounded-full bg-sky-200 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 h-[350px] w-[500px] rounded-full bg-primary/60 blur-[150px]" />

        <Container className="relative">
          <SectionTitle subtitulo="Como funciona" antes="Comece em" destaque="3 passos" centralizado />

          <ol className="mx-auto mt-14 grid max-w-xl gap-6 lg:max-w-none lg:grid-cols-3">
            {passos.map((passo, i) => (
              <li key={passo.titulo} className="relative rounded-3xl bg-white p-8 drop-shadow-xl">
                <span className="font-heading text-6xl font-extrabold text-accent-strong">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-heading text-2xl font-bold text-slate-900">{passo.titulo}</h3>
                <p className="mt-3 text-slate-600">{passo.texto}</p>
              </li>
            ))}
          </ol>
        </Container>
      </div>
    </section>
  );
}

export default ComoFunciona;
