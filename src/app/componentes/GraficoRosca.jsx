// Gráfico de rosca em SVG puro (sem biblioteca).
// fatias: [{ chave, nome, cor, valor }] já na ordem de exibição (maior primeiro).
// selecionada: chave da fatia em destaque (as outras ficam apagadas) ou null.
// centro: conteúdo (HTML) mostrado no meio da rosca.
// O SVG é decorativo (aria-hidden): as linhas da lista abaixo fazem o mesmo papel com teclado e leitor de tela.

const TAMANHO = 200;
const C = TAMANHO / 2;
const RAIO_FORA = 92;
const RAIO_DENTRO = 60;
const RAIO_ROTULO = (RAIO_FORA + RAIO_DENTRO) / 2;
const PERCENTUAL_MINIMO_ROTULO = 5;

// Ponto no círculo; ângulo 0 = topo, sentido horário
function ponto(raio, angulo) {
  return [C + raio * Math.sin(angulo), C - raio * Math.cos(angulo)];
}

// Caminho de um pedaço do anel entre dois ângulos (em radianos)
function caminhoFatia(a0, a1) {
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = ponto(RAIO_FORA, a0);
  const [x1, y1] = ponto(RAIO_FORA, a1);
  const [x2, y2] = ponto(RAIO_DENTRO, a1);
  const [x3, y3] = ponto(RAIO_DENTRO, a0);
  return `M${x0} ${y0}A${RAIO_FORA} ${RAIO_FORA} 0 ${grande} 1 ${x1} ${y1}L${x2} ${y2}A${RAIO_DENTRO} ${RAIO_DENTRO} 0 ${grande} 0 ${x3} ${y3}Z`;
}

// Fatia de 100%: o arco de 360° não existe em SVG, então são duas metades
function caminhoAnelCompleto() {
  return `${caminhoFatia(0, Math.PI)} ${caminhoFatia(Math.PI, 2 * Math.PI)}`;
}

// Calcula ângulos e percentuais de cada fatia
function montarFatias(fatias) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  let inicio = 0;
  return fatias
    .filter((f) => f.valor > 0)
    .map((f) => {
      const parte = total > 0 ? f.valor / total : 0;
      const a0 = inicio;
      const a1 = inicio + parte * 2 * Math.PI;
      inicio = a1;
      return { ...f, parte, percentual: parte * 100, a0, a1 };
    });
}

function GraficoRosca({ fatias, selecionada = null, onEscolher, centro, rotulo }) {
  const pedacos = montarFatias(fatias);
  const unica = pedacos.length === 1;

  return (
    <div className="relative mx-auto aspect-square w-48 sm:w-56">
      <svg viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} className="h-full w-full" aria-hidden="true">
        {pedacos.length === 0 && <circle cx={C} cy={C} r={RAIO_ROTULO} fill="none" stroke="#e2e8f0" strokeWidth={RAIO_FORA - RAIO_DENTRO} />}
        {pedacos.map((p) => {
          const apagada = selecionada !== null && selecionada !== p.chave;
          return (
            <path
              key={p.chave}
              d={unica || p.parte >= 0.9999 ? caminhoAnelCompleto() : caminhoFatia(p.a0, p.a1)}
              fill={p.cor}
              stroke="#fff"
              strokeWidth={unica ? 0 : 1.5}
              strokeLinejoin="round"
              opacity={apagada ? 0.25 : 1}
              onClick={() => onEscolher?.(p.chave)}
              className="cursor-pointer transition-opacity duration-200 motion-reduce:transition-none"
            />
          );
        })}
        {/* % em cima das fatias a partir de 5% (as menores aparecem na lista) */}
        {pedacos
          .filter((p) => p.percentual >= PERCENTUAL_MINIMO_ROTULO)
          .map((p) => {
            // Fatia única: rótulo no alto à esquerda, como no app de referência
            const meio = unica ? -Math.PI / 4 : (p.a0 + p.a1) / 2;
            const [x, y] = ponto(RAIO_ROTULO, meio);
            const apagada = selecionada !== null && selecionada !== p.chave;
            return (
              <text
                key={`rotulo-${p.chave}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="12"
                fontWeight="700"
                fill="#fff"
                stroke="rgba(15,23,42,0.45)"
                strokeWidth="2.5"
                paintOrder="stroke"
                opacity={apagada ? 0.35 : 1}
                pointerEvents="none"
                className="transition-opacity duration-200 motion-reduce:transition-none"
              >
                {Math.round(p.percentual)}%
              </text>
            );
          })}
      </svg>
      {/* Centro: total do mês ou a categoria escolhida */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
        <div className="flex w-[58%] flex-col items-center text-center">{centro}</div>
      </div>
      {rotulo && <p className="sr-only">{rotulo}</p>}
    </div>
  );
}

export default GraficoRosca;
