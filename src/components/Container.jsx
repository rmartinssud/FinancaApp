// Centraliza o conteúdo com largura máxima e espaçamento lateral responsivo.
// Substitui as larguras fixas antigas (w-[1280px], w-[1460px]...).
function Container({ children, className = "" }) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export default Container;
