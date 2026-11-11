import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaBoxArchive, FaBoxOpen, FaTrashCan, FaChevronRight } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import BotaoAjuda from "./componentes/BotaoAjuda.jsx";
import Modal from "./componentes/Modal.jsx";
import DesarquivarOrcamento from "./componentes/DesarquivarOrcamento.jsx";
import { IconeOrcamento } from "./componentes/CartaoOrcamento.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Alerta from "../auth/Alerta.jsx";
import { api, formatarReais } from "../lib/api.js";
import { nomeDoMes } from "../lib/datas.js";

const botaoAcao =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";
const botaoCancelar =
  "inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

const tipoTexto = (b) => (b.isGroup ? "Agrupado" : b.kind === "INCOME" ? "Receita" : "Despesa");

// Orçamentos arquivados: ver detalhes (último mês em que valeu), desarquivar ou excluir
function OrcamentosArquivados() {
  const { erroMe, podeEditar } = useMe();
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [janela, setJanela] = useState(null); // { tipo: "desarquivar" | "excluir", orcamento }
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(() => {
    setErro("");
    api("/budgets/archived")
      .then((r) => setLista(r.budgets))
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const fechar = () => setJanela(null);

  async function excluir(b) {
    setApagando(true);
    try {
      await api(`/budgets/${b.id}`, { method: "DELETE" });
      setJanela(null);
      setAviso(`“${b.name}” foi excluído.`);
      carregar();
    } catch (falha) {
      setErro(falha.message);
      setJanela(null);
    } finally {
      setApagando(false);
    }
  }

  return (
    <AppLayout semBotaoNovo>
      <Link to="/app/orcamentos" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
        <FaArrowLeft aria-hidden="true" />
        Orçamentos
      </Link>

      <div className="mt-2 flex items-center gap-1">
        <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Orçamentos arquivados</h1>
        <BotaoAjuda artigo="orcamentos" assunto="orçamentos arquivados" />
      </div>

      <Alerta className="mt-2">{erroMe || erro}</Alerta>
      <Alerta tipo="sucesso" className="mt-2">
        {aviso}
      </Alerta>

      {!lista && !erro && (
        <p role="status" className="mt-6 text-slate-500">
          Carregando...
        </p>
      )}

      {lista && lista.length === 0 && (
        <section className={`${cartao} mt-6 text-center`}>
          <FaBoxArchive aria-hidden="true" className="mx-auto text-4xl text-primary" />
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-900">Nenhum orçamento arquivado</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">Quando você arquivar um orçamento mensal, ele aparece aqui. Os meses passados dele continuam guardados.</p>
        </section>
      )}

      {lista && lista.length > 0 && (
        <ul className="mt-4 space-y-3">
          {lista.map((b) => (
            <li key={b.id} className={`${cartao} !p-3 sm:!p-5`}>
              <Link
                to={`/app/orcamentos/${b.id}?mes=${b.lastMonth}&de=arquivados`}
                aria-label={`${b.name}: ver detalhes`}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
              >
                <IconeOrcamento orcamento={b} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-slate-900">{b.name}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {tipoTexto(b)} · desde {nomeDoMes(b.startMonth)}
                  </span>
                  <span className="block truncate text-sm text-slate-500">Arquivado a partir de {nomeDoMes(b.archivedFromMonth)}</span>
                  <span className="block truncate text-sm text-slate-600">
                    Em {nomeDoMes(b.lastMonth)}: <span className="whitespace-nowrap font-semibold">{formatarReais(b.progress.used)}</span>
                    <span className="whitespace-nowrap"> de {formatarReais(b.progress.goal)}</span>
                  </span>
                </span>
                <FaChevronRight aria-hidden="true" className="shrink-0 text-slate-400" />
              </Link>
              {podeEditar && (
                <div className="mt-2 flex flex-wrap gap-2 px-2">
                  <button type="button" className={botaoAcao} onClick={() => setJanela({ tipo: "desarquivar", orcamento: b })}>
                    <FaBoxOpen aria-hidden="true" /> Desarquivar
                  </button>
                  <button type="button" className={`${botaoAcao} !text-red-700`} onClick={() => setJanela({ tipo: "excluir", orcamento: b })}>
                    <FaTrashCan aria-hidden="true" /> Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {janela?.tipo === "desarquivar" && (
        <DesarquivarOrcamento
          orcamento={janela.orcamento}
          onFechar={fechar}
          onSalvo={(r, mes) => navigate(`/app/orcamentos?mes=${mes}&aba=${r.kind}`)}
        />
      )}
      {janela?.tipo === "excluir" && (
        <Modal titulo="Excluir orçamento?" onFechar={fechar}>
          <p className="text-slate-700">
            “{janela.orcamento.name}” e todo o histórico de metas dele serão apagados, inclusive dos meses passados. Os lançamentos não mudam.
          </p>
          {janela.orcamento.usedBy.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">A meta de {janela.orcamento.usedBy.map((n) => `“${n}”`).join(", ")} é um percentual deste orçamento: altere antes de excluir.</p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className={botaoCancelar}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => excluir(janela.orcamento)}
              disabled={apagando}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
            >
              <FaTrashCan aria-hidden="true" />
              {apagando ? "Excluindo..." : "Sim, excluir"}
            </button>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

export default OrcamentosArquivados;
