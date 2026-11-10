import { BANCOS, urlLogo } from "../dados/bancos.js";
import { TIPOS_CONTA } from "../../lib/contas.js";

const PORTE = {
  xs: { caixa: "h-4 w-4 text-[10px]", img: "h-3 w-3" },
  sm: { caixa: "h-6 w-6 text-xs", img: "h-4 w-4" },
  md: { caixa: "h-11 w-11 text-lg", img: "h-7 w-7" },
  lg: { caixa: "h-14 w-14 text-2xl", img: "h-9 w-9" },
};

// Logo do banco num círculo branco; sem logo, o ícone do tipo da conta (como antes)
function LogoConta({ conta, tamanho = "md", className = "" }) {
  const p = PORTE[tamanho];
  const banco = conta.bankLogo ? BANCOS.find((b) => b.slug === conta.bankLogo) : null;
  if (banco) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200 ${p.caixa} ${className}`}
        style={banco.fundo ? { backgroundColor: banco.fundo } : undefined}
      >
        <img src={urlLogo(banco.slug)} alt="" loading="lazy" decoding="async" className={`${p.img} object-contain`} />
      </span>
    );
  }
  const { Icone } = TIPOS_CONTA[conta.type] ?? TIPOS_CONTA.WALLET;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-soft text-primary ${p.caixa} ${className}`}>
      <Icone aria-hidden="true" />
    </span>
  );
}

export default LogoConta;
