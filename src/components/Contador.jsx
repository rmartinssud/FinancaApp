import { useEffect, useRef, useState } from "react";
import CountUp from "react-countup";

// Número que conta de 0 até "fim" quando aparece na tela.
// Usa IntersectionObserver para saber quando o número ficou visível.
// Antes disso (ou se o navegador não suportar) mostra o valor final, então nunca fica em branco.
function Contador({ fim, decimais = 0, prefixo = "", sufixo = "" }) {
  const ref = useRef(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          observador.disconnect(); // conta só uma vez
        }
      },
      { threshold: 0.3 }
    );
    observador.observe(ref.current);
    return () => observador.disconnect();
  }, []);

  const valorFinal = `${prefixo}${fim.toFixed(decimais).replace(".", ",")}${sufixo}`;

  return (
    <span ref={ref}>
      {visivel ? (
        <CountUp end={fim} duration={2.5} decimals={decimais} decimal="," prefix={prefixo} suffix={sufixo} />
      ) : (
        valorFinal
      )}
    </span>
  );
}

export default Contador;
