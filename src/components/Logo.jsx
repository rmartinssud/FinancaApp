import img from "../assets/logo-famicash.webp";

// Logo clicável que volta para o topo da página
function Logo({ className = "" }) {
  return (
    <a href="#topo" className={`logobox flex shrink-0 ${className}`}>
      <img src={img} alt="Famicash" className="h-auto w-36 sm:w-44" />
    </a>
  );
}

export default Logo;
