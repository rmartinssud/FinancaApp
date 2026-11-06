import { CheckCircleFill } from "react-bootstrap-icons";
import { FaWhatsapp, FaChevronLeft } from "react-icons/fa6";
import Container from "./Container.jsx";
import SectionTitle from "./SectionTitle.jsx";
import ButtonArrow45 from "./ButtonArrow45.jsx";

// Conversa de exemplo exibida no celular. "de" = quem enviou a mensagem.
const conversa = [
  { de: "usuario", texto: "gastei 45 no mercado no cartão Nubank", hora: "09:41" },
  { de: "bot", texto: "Registrei: Mercado R$ 45,00 – Cartão Nubank. Confirma? ✅", hora: "09:41" },
  { de: "usuario", texto: "resumo do mês", hora: "18:02" },
  {
    de: "bot",
    texto:
      "📊 Novembro até agora:\nReceitas: R$ 5.200,00\nDespesas: R$ 3.117,10\nSaldo: R$ 2.082,90\n\n💡 Dica: Mercado já usou 82% do limite. Que tal uma lista antes da próxima compra?",
    hora: "18:02",
  },
];

const vantagens = [
  "Registre gastos e receitas em linguagem natural",
  "Confirme ou corrija com uma resposta",
  "Peça o resumo do mês e receba dicas de orçamento",
];

// Mensagem individual (balão verde do usuário ou branco do assistente)
function Balao({ de, texto, hora }) {
  const doUsuario = de === "usuario";
  return (
    <div className={`flex ${doUsuario ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-snug text-slate-800 shadow-sm ${doUsuario ? "rounded-tr-sm bg-[#d9fdd3]" : "rounded-tl-sm bg-white"}`}
      >
        {texto}
        <span className="mt-1 block text-right text-[10px] text-slate-500">{hora}</span>
      </div>
    </div>
  );
}

function WhatsappDemo() {
  return (
    <section id="whatsapp" className="py-20 md:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-2">
        {/* Celular feito só com HTML/CSS */}
        <div className="relative order-2 flex justify-center lg:order-1">
          <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300 blur-[80px]" />
          <div className="relative w-full max-w-[320px] rounded-[48px] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
            <div className="overflow-hidden rounded-[38px] bg-[#efeae2]">
              {/* Cabeçalho do chat */}
              <div className="flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-9 text-white">
                <FaChevronLeft aria-hidden="true" />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary">
                  <FaWhatsapp aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold">Assistente Finanças</p>
                  <p className="text-[11px] text-white/80">online</p>
                </div>
              </div>
              {/* Mensagens */}
              <div className="flex min-h-[440px] flex-col gap-2 p-3">
                {conversa.map((msg, i) => (
                  <Balao key={i} {...msg} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <SectionTitle subtitulo="Assistente no WhatsApp" antes="Registre gastos" destaque="conversando" />
          <p className="mt-6 text-lg text-slate-600">
            Sem abrir o app: mande uma mensagem como faria para um amigo. O assistente entende o valor, a categoria e a
            forma de pagamento, pede sua confirmação e já atualiza o orçamento da família.
          </p>
          <ul className="mt-8 space-y-3">
            {vantagens.map((v) => (
              <li key={v} className="flex items-start gap-4 text-primary">
                <CheckCircleFill size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                {v}
              </li>
            ))}
          </ul>
          <ButtonArrow45 texto="Quero testar" href="#planos" className="mt-10" />
        </div>
      </Container>
    </section>
  );
}

export default WhatsappDemo;
