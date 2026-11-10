import Modal from "./Modal.jsx";
import IconeCategoria from "./IconeCategoria.jsx";
import { ChipsTags } from "./SeletorTags.jsx";
import { ListaAnexos } from "./CampoAnexos.jsx";
import { formatarReais } from "../../lib/api.js";
import { nomeCategoria } from "../../lib/categorias.js";

const dia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Item({ rotulo, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-slate-500">{rotulo}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

// Detalhes de um lançamento só para ver (quem tem acesso somente leitura)
function DetalhesLancamento({ lancamento: l, onFechar }) {
  const receita = l.type === "INCOME";
  const ignorados = [
    l.ignoreInStatistics && "Estatísticas e Gráficos",
    l.ignoreInBudgets && "Orçamentos",
    l.ignoreInMonthlySavings && "Economia mensal",
    l.ignoreInTotals && "totais",
  ].filter(Boolean);
  return (
    <Modal titulo="Detalhes do lançamento" onFechar={onFechar}>
      <p className="font-bold text-slate-900">{l.description}</p>
      <p className={`mt-1 whitespace-nowrap font-heading text-xl font-bold ${l.type === "TRANSFER" ? "text-amber-700" : receita ? "text-emerald-700" : "text-red-600"}`}>
        {formatarReais(l.amount)}
      </p>
      <dl className="mt-3 divide-y divide-slate-100">
        {(l.fees || l.discount) && (
          <Item rotulo="Valor">
            <span className="whitespace-nowrap">{formatarReais(l.baseAmount)}</span>
            {l.fees && <span className="block whitespace-nowrap">+ encargos {formatarReais(l.fees)}</span>}
            {l.discount && <span className="block whitespace-nowrap">− desconto {formatarReais(l.discount)}</span>}
          </Item>
        )}
        <Item rotulo="Data (vencimento)">{dia(l.date)}</Item>
        {l.launchDate && <Item rotulo="Data lançamento">{dia(l.launchDate)}</Item>}
        <Item rotulo="Situação">{l.status === "CONFIRMED" ? "Efetivada" : l.noAutoConfirm ? "Pendente (não efetiva sozinha)" : "Pendente"}</Item>
        <Item rotulo="Conta">{l.account.name}</Item>
        {l.type !== "TRANSFER" &&
          (l.splits?.length ? (
            <Item rotulo="Categorias">
              <ul className="space-y-1">
                {l.splits.map((s) => (
                  <li key={s.id} className="flex items-center justify-end gap-2">
                    <IconeCategoria categoria={s.category} tamanho="h-5 w-5 text-[10px]" />
                    <span className="truncate">{nomeCategoria(s.category)}</span>
                    <span className="whitespace-nowrap">{formatarReais(s.amount)}</span>
                  </li>
                ))}
              </ul>
            </Item>
          ) : (
            <Item rotulo="Categoria">{nomeCategoria(l.category)}</Item>
          ))}
        {l.tags?.length > 0 && (
          <Item rotulo="Tags">
            <span className="flex justify-end">
              <ChipsTags tags={l.tags} />
            </span>
          </Item>
        )}
        {l.notes && <Item rotulo="Observações">{l.notes}</Item>}
        {ignorados.length > 0 && <Item rotulo="Fica fora de">{ignorados.join(", ")}</Item>}
      </dl>
      {l.attachments?.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-slate-500">Anexos</p>
          <ListaAnexos anexos={l.attachments} />
        </div>
      )}
    </Modal>
  );
}

export default DetalhesLancamento;
