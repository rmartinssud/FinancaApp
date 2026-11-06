import { useState } from "react";
import Logo from "./Logo.jsx";
import ButtonArrow45 from "./ButtonArrow45.jsx";
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
        <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex h-full">
            {[FaFacebook, FaInstagram, FaSquareXTwitter].map((Icone, i) => (
              <a
                key={i}
                href="#"
                aria-label="Rede social"
                className="flex h-full w-10 items-center justify-center border-r border-white/30 first:border-l hover:bg-white/10"
              >
                <Icone className="text-lg" />
              </a>
            ))}
          </div>
          <p className="hidden lg:block">Cuidando de você e do seu dinheiro para uma vida melhor</p>
          <div className="flex h-full">
            <a href="#contato" className="flex items-center gap-2 border-x border-white/30 px-3 hover:bg-white/10 sm:px-6">
              <FaSquareEnvelope /> Email
            </a>
            <a href="#whatsapp" className="flex items-center gap-2 border-r border-white/30 px-3 hover:bg-white/10 sm:px-6">
              <FaRegComment /> Chat
            </a>
          </div>
        </div>
      </div>

      {/* Barra principal: fica fixa no topo ao rolar */}
      <header className="sticky top-0 z-50 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            {/* Botão hambúrguer: só aparece em telas pequenas */}
            <button
              type="button"
              className="rounded-full p-2 text-xl text-primary hover:bg-soft lg:hidden"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
              aria-controls="menu-mobile"
              onClick={() => setMenuAberto(!menuAberto)}
            >
              {menuAberto ? <FaXmark /> : <FaBars />}
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

          <div className="flex items-center gap-4">
            <a href="#planos" aria-label="Entrar" className="text-xl text-primary hover:text-primary-light">
              <FaUser />
            </a>
            <ButtonArrow45 texto="Comece Agora" href="#planos" className="hidden sm:inline-flex" />
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
              <li className="mt-3 sm:hidden">
                <ButtonArrow45 texto="Comece Agora" href="#planos" onClick={fecharMenu} className="w-full" />
              </li>
            </ul>
          </nav>
        )}
      </header>
    </>
  );
}

export default Navbar;
