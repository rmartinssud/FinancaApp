import { FaFacebook, FaInstagram, FaXTwitter, FaWhatsapp } from "react-icons/fa6";
import Logo from "./Logo.jsx";
import Container from "./Container.jsx";

const colunas = [
  {
    titulo: "Produto",
    links: [
      { label: "Funcionalidades", href: "#funcionalidades" },
      { label: "Como funciona", href: "#como-funciona" },
      { label: "WhatsApp", href: "#whatsapp" },
      { label: "Planos", href: "#planos" },
    ],
  },
  {
    titulo: "Empresa",
    links: [
      { label: "Sobre Nós", href: "#sobre" },
      { label: "Dúvidas", href: "#faq" },
      { label: "Fale Conosco", href: "#contato" },
    ],
  },
  {
    titulo: "Legal",
    links: [
      { label: "Privacidade (LGPD)", href: "#" },
      { label: "Termos de uso", href: "#" },
    ],
  },
];

const redes = [
  { icone: FaFacebook, nome: "Facebook" },
  { icone: FaInstagram, nome: "Instagram" },
  { icone: FaXTwitter, nome: "X (Twitter)" },
  { icone: FaWhatsapp, nome: "WhatsApp" },
];

function Footer() {
  return (
    <footer className="rounded-t-[48px] bg-soft pt-16">
      <Container>
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-slate-600">Cuidando de você e do seu dinheiro para uma vida melhor.</p>
            <div className="mt-6 flex gap-3">
              {redes.map(({ icone: Icone, nome }) => (
                <a
                  key={nome}
                  href="#"
                  aria-label={nome}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-light"
                >
                  <Icone aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {colunas.map((coluna) => (
            <div key={coluna.titulo}>
              <h3 className="font-heading font-bold text-slate-900">{coluna.titulo}</h3>
              <ul className="mt-4 space-y-2">
                {coluna.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-slate-600 transition-colors hover:text-primary">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-14 border-t border-primary/15 py-6 text-center text-sm text-slate-500">
          © 2026 Finanças Pessoais. Todos os direitos reservados.
        </p>
      </Container>
    </footer>
  );
}

export default Footer;
