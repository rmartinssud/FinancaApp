import { useState } from "react";
import Logo from "./Logo.jsx";
import ButtonArrow45 from "./ButtonArrow45.jsx";
import { Link } from "react-router-dom";
import { linksMenu } from "../data/menu.js";
import {
  FaFacebook,
  FaInstagram,
  FaSquareXTwitter,
  FaSquareEnvelope,
  FaRegComment,
  FaBars,
  FaXmark,
  FaUser,
} from "react-icons/fa6";

function Navbar() {
  // Controla se o menu mobile (hambúrguer) está aberto
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = () => setMenuAberto(false);

  return (
    <>
      {/* Barra superior (redes sociais e contato) */}
      <div id="topo" className="bg-primary text-sm text-white">
        <div className="mx-auto flex h-11 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex h-full">
            {[
              { icone: FaFacebook, nome: "Facebook" },
              { icone: FaInstagram, nome: "Instagram" },
              { icone: FaSquareXTwitter, nome: "X (Twitter)" },
            ].map(({ icone: Icone, nome }) => (
              <a
                key={nome}
                href="#"
                aria-label={nome}
                className="flex h-full items-center px-2.5 first:pl-0 hover:text-white/80"
              >
                <Icone className="text-lg" aria-hidden="true" />
              </a>
            ))}
          </div>
          <p className="hidden lg:block">Cuidando de você e do seu dinheiro para uma vida melhor</p>
          <div className="flex h-full gap-5 sm:gap-6">
            <a href="#contato" className="flex items-center gap-2 hover:text-white/80">
              <FaSquareEnvelope aria-hidden="true" /> Email
            </a>
            <a href="#whatsapp" className="flex items-center gap-2 hover:text-white/80">
              <FaRegComment aria-hidden="true" /> Chat
            </a>
          </div>
        </div>
      </div>

      {/* Barra principal: fica fixa no topo ao rolar */}
      <header className="sticky top-0 z-50 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            {/* Botão hambúrguer: só aparece em telas pequenas */}
            <button
              type="button"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-xl text-primary hover:bg-soft lg:hidden"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
              aria-controls="menu-mobile"
              onClick={() => setMenuAberto(!menuAberto)}
            >
              {menuAberto ? <FaXmark aria-hidden="true" /> : <FaBars aria-hidden="true" />}
            </button>
            <Logo />
          </div>

          {/* Menu desktop */}
          <nav className="hidden lg:block" aria-label="Menu principal">
            <ul className="flex gap-8 font-medium text-primary">
              {linksMenu.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition-colors hover:text-primary-light">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/entrar"
              aria-label="Entrar"
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-xl text-primary hover:bg-soft hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <FaUser aria-hidden="true" />
              <span className="hidden text-base font-bold md:inline">Entrar</span>
            </Link>
            <ButtonArrow45 texto="Comece Agora" to="/cadastro" className="hidden sm:inline-flex" />
          </div>
        </div>

        {/* Menu mobile: abre abaixo da barra quando menuAberto = true */}
        {menuAberto && (
          <nav id="menu-mobile" className="border-t border-soft bg-white lg:hidden" aria-label="Menu mobile">
            <ul className="mx-auto flex max-w-7xl flex-col px-5 py-4 sm:px-8">
              {linksMenu.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={fecharMenu}
                    className="block rounded-xl px-3 py-3 font-medium text-primary hover:bg-soft"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  to="/entrar"
                  onClick={fecharMenu}
                  className="block rounded-xl px-3 py-3 font-medium text-primary hover:bg-soft"
                >
                  Entrar
                </Link>
              </li>
              <li className="mt-3 sm:hidden">
                <ButtonArrow45 texto="Comece Agora" to="/cadastro" onClick={fecharMenu} className="w-full" />
              </li>
            </ul>
          </nav>
        )}
      </header>
    </>
  );
}

export default Navbar;
