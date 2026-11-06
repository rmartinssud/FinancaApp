import img from "../assets/logo-financas.webp";

// Logo clicável que volta para o topo da página
function Logo({ className = "" }) {
  return (
    <a href="#topo" className={`logobox flex shrink-0 ${className}`}>
      <img src={img} alt="Finanças Pessoais" className="h-auto w-32 sm:w-40" />
    </a>
  );
}

export default Logo;
