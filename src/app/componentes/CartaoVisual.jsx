import { FaCreditCard } from "react-icons/fa6";
import { formatarReais } from "../../lib/api.js";
import { BANDEIRAS, COR_PADRAO } from "../../lib/cartoes.js";

// Desenho do cartão (cor escolhida, nome, bandeira e limite disponível)
function CartaoVisual({ cartao, className = "" }) {
  const cor = cartao.color ?? COR_PADRAO;
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_20px_40px_-16px_rgba(15,23,42,0.6)] ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 55%, #0f172a))` }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate font-heading text-xl font-bold">{cartao.name}</p>
        <p className="shrink-0 text-sm font-bold uppercase tracking-wider text-white/85">{BANDEIRAS[cartao.brand] ?? "Cartão"}</p>
      </div>
      <FaCreditCard aria-hidden="true" className="mt-4 text-2xl text-white/70" />
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-white/75">Disponível</p>
          <p className="font-heading text-lg font-bold [overflow-wrap:anywhere]">{formatarReais(cartao.availableLimit)}</p>
        </div>
        {cartao.closingDay && cartao.dueDay && (
          <p className="shrink-0 text-right text-xs text-white/80">
            Fecha dia {cartao.closingDay}
            <br />
            Vence dia {cartao.dueDay}
          </p>
        )}
      </div>
    </div>
  );
}

export default CartaoVisual;
