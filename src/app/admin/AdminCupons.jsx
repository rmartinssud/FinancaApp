import { useCallback, useEffect, useState } from "react";
import { FaTicket } from "react-icons/fa6";
import AppLayout from "../AppLayout.jsx";
import Interruptor from "../componentes/Interruptor.jsx";
import { cartao } from "../componentes/estilos.js";
import Campo from "../../auth/Campo.jsx";
import BotaoEnviar from "../../auth/BotaoEnviar.jsx";
import Alerta from "../../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../../lib/api.js";
import { NOME_PLANO } from "../../lib/planos.js";

// Cupons de plano (só ADMIN da plataforma; a API confere de novo).
// Ex.: FUNDADOR = Família+ por 12 meses. Cada espaço usa um cupom uma vez só.

const dataCurta = (iso) => new Date(iso).toLocaleDateString("pt-BR");
const vazio = { code: "", plan: "FAMILIA", months: "12", maxUses: "", expiresAt: "", note: "" };

function NovoCupom({ onCriado }) {
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setErros({});
    setSalvando(true);
    try {
      await api(
        "/admin/cupons",
        enviarJson("POST", {
          code: f.code.trim() || null,
          plan: f.plan,
          months: Number(f.months),
          maxUses: f.maxUses ? Number(f.maxUses) : null,
          // Vale até o fim do dia escolhido (horário de Brasília)
          expiresAt: f.expiresAt ? `${f.expiresAt}T23:59:59-03:00` : null,
          note: f.note.trim() || null,
        }),
      );
      setF(vazio);
      onCriado();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate className={`${cartao} mt-6 space-y-4`}>
      <h2 className="font-heading text-xl font-bold text-slate-900">Novo cupom</h2>
      <Alerta>{erro}</Alerta>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Código (vazio = automático)" maxLength={40} autoComplete="off" placeholder="Ex.: FUNDADOR" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} erro={erros.code} />
        <div>
          <label htmlFor="cupom-plano" className="mb-2 block font-medium text-slate-800">Plano</label>
          <select id="cupom-plano" value={f.plan} onChange={mudar("plan")} className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4">
            <option value="FAMILIA">Família</option>
            <option value="FAMILIA_PLUS">Família+</option>
          </select>
        </div>
        <Campo label="Duração (meses, 1 a 12)" type="number" min={1} max={12} inputMode="numeric" value={f.months} onChange={mudar("months")} erro={erros.months} />
        <Campo label="Máximo de usos (vazio = sem limite)" type="number" min={1} inputMode="numeric" value={f.maxUses} onChange={mudar("maxUses")} erro={erros.maxUses} />
        <Campo label="Pode ser usado até (opcional)" type="date" value={f.expiresAt} onChange={mudar("expiresAt")} erro={erros.expiresAt} />
        <Campo label="Observação (opcional)" maxLength={200} value={f.note} onChange={mudar("note")} erro={erros.note} />
      </div>
      <BotaoEnviar texto="Criar cupom" carregando={salvando} textoCarregando="Criando..." />
    </form>
  );
}

function AdminCupons() {
  const [cupons, setCupons] = useState(null);
  const [erro, setErro] = useState("");
  const [semAcesso, setSemAcesso] = useState(false);
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(() => {
    api("/admin/cupons")
      .then(setCupons)
      .catch((e) => (e.status === 403 ? setSemAcesso(true) : setErro(e.message)));
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function alternar(c) {
    try {
      const novo = await api(`/admin/cupons/${c.id}`, enviarJson("PATCH", { active: !c.active }));
      setCupons((l) => l.map((x) => (x.id === c.id ? novo : x)));
    } catch (e) {
      setErro(e.message);
    }
  }

  if (semAcesso) {
    return (
      <AppLayout semBotaoNovo>
        <Alerta>Esta área é só para administradores do Famicash.</Alerta>
      </AppLayout>
    );
  }

  return (
    <AppLayout semBotaoNovo>
      <h1 className="flex items-center gap-3 font-heading text-2xl font-bold text-slate-900 md:text-4xl">
        <FaTicket aria-hidden="true" className="text-primary" /> Cupons
      </h1>
      <p className="mt-1 text-slate-600">O dono do espaço usa o código em Meu plano. Cada espaço usa um cupom uma vez só.</p>
      <Alerta className="mt-4">{erro}</Alerta>

      <NovoCupom onCriado={carregar} />

      <section className={`${cartao} mt-6`} aria-label="Lista de cupons">
        {cupons === null && !erro && <p role="status" className="text-slate-500">Carregando...</p>}
        {cupons?.length === 0 && <p className="text-slate-600">Nenhum cupom ainda.</p>}
        <ul className="divide-y divide-slate-100">
          {(cupons ?? []).map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-bold text-slate-900">{c.code}</p>
                  <p className="text-sm text-slate-600">
                    {NOME_PLANO[c.plan]} · {c.months} {c.months === 1 ? "mês" : "meses"} · {c.uses}
                    {c.maxUses ? ` de ${c.maxUses}` : ""} {c.uses === 1 ? "uso" : "usos"}
                    {c.expiresAt && ` · até ${dataCurta(c.expiresAt)}`}
                    {c.note && ` · ${c.note}`}
                  </p>
                </div>
                <Interruptor texto="Ativo" ligado={c.active} onMudar={() => alternar(c)} />
                {c.uses > 0 && (
                  <button type="button" onClick={() => setAberto(aberto === c.id ? null : c.id)} aria-expanded={aberto === c.id} className="min-h-11 rounded-full px-3 text-sm font-bold text-primary hover:bg-soft">
                    {aberto === c.id ? "Esconder" : "Quem usou"}
                  </button>
                )}
              </div>
              {aberto === c.id && (
                <ul className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                  {c.redemptions.map((r) => (
                    <li key={`${r.createdAt}-${r.userEmail}`}>
                      {dataCurta(r.createdAt)} · {r.userName ?? "?"} ({r.userEmail ?? "conta apagada"}) · espaço {r.householdName} · plano até {dataCurta(r.planEndsAt)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </AppLayout>
  );
}

export default AdminCupons;
