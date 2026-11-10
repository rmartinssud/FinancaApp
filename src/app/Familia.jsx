import { useCallback, useEffect, useState } from "react";
import { FaEnvelope, FaLink, FaRotateRight, FaXmark, FaPen, FaArrowRightFromBracket } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import Avatar from "./componentes/Avatar.jsx";
import BotaoApagar from "./componentes/BotaoApagar.jsx";
import CampoSelect from "./componentes/CampoSelect.jsx";
import { cartao, botaoIcone, botaoSecundario } from "./componentes/estilos.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../lib/api.js";
import { NOME_PAPEL } from "../lib/pessoas.js";

const PAPEIS = [
  { valor: "MEMBER", texto: "Membro", dica: "Lança, edita e apaga finanças." },
  { valor: "VIEWER", texto: "Somente leitura", dica: "Só vê, não altera nada." },
  { valor: "OWNER", texto: "Dono", dica: "Tudo, inclusive convidar e remover pessoas." },
];

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const dataCurta = (iso) => formatoData.format(new Date(iso));

// Copia para a área de transferência; se o navegador bloquear, devolve false
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function Renomear({ nome, onFechar, onSalvo }) {
  const [valor, setValor] = useState(nome);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api("/family", enviarJson("PATCH", { name: valor.trim() }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Renomear espaço" onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>
        <Campo label="Nome do espaço" maxLength={60} value={valor} onChange={(e) => setValor(e.target.value)} erro={erros.name} autoFocus />
        <BotaoEnviar texto="Salvar" carregando={salvando} textoCarregando="Salvando..." className="w-full" />
      </form>
    </Modal>
  );
}

// Convidar por email ou gerar um link para mandar no WhatsApp (só o dono)
function Convidar({ onConvidado }) {
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("MEMBER");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [link, setLink] = useState("");
  const [enviando, setEnviando] = useState("");

  async function convidar(comEmail) {
    setErro("");
    setAviso("");
    setLink("");
    setErros({});
    if (comEmail && !email.trim()) return setErros({ email: "Digite o email da pessoa." });
    setEnviando(comEmail ? "email" : "link");
    try {
      const r = await api("/family/invites", enviarJson("POST", { email: comEmail ? email.trim() : null, role: papel }));
      if (comEmail) {
        setAviso(`Convite enviado para ${email.trim()}. O link vale por 7 dias.`);
        setEmail("");
      } else {
        const ok = await copiar(r.url);
        setLink(r.url);
        setAviso(ok ? "Link copiado! Cole no WhatsApp. Vale por 7 dias e só pode ser usado uma vez." : "Copie o link abaixo e mande no WhatsApp. Vale por 7 dias.");
      }
      onConvidado();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
    }
    setEnviando("");
  }

  return (
    <section aria-labelledby="titulo-convidar" className={cartao}>
      <h2 id="titulo-convidar" className="font-heading text-xl font-bold text-slate-900">
        Convidar pessoa
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          convidar(true);
        }}
        noValidate
        className="mt-4 space-y-4"
      >
        <Alerta>{erro}</Alerta>
        <Alerta tipo="sucesso">{aviso}</Alerta>
        {link && (
          <input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.target.select()} className="h-12 w-full rounded-2xl border border-slate-300 bg-soft px-4 text-sm text-slate-700" />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Email" type="email" autoComplete="off" placeholder="nome@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} erro={erros.email} />
          <CampoSelect label="Papel" value={papel} onChange={(e) => setPapel(e.target.value)}>
            {PAPEIS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.texto}
              </option>
            ))}
          </CampoSelect>
        </div>
        <p className="text-sm text-slate-500">{PAPEIS.find((p) => p.valor === papel).dica}</p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={Boolean(enviando)} className={`${botaoSecundario} bg-primary text-white disabled:opacity-60`}>
            <FaEnvelope aria-hidden="true" />
            {enviando === "email" ? "Enviando..." : "Enviar convite"}
          </button>
          <button type="button" onClick={() => convidar(false)} disabled={Boolean(enviando)} className={`${botaoSecundario} disabled:opacity-60`}>
            <FaLink aria-hidden="true" />
            {enviando === "link" ? "Gerando..." : "Copiar link"}
          </button>
        </div>
      </form>
    </section>
  );
}

// Tela "Família": quem está no espaço ativo, convites e papéis
// Sair do espaço em duas etapas. Muita gente toca aqui achando que é só "voltar" para o
// espaço pessoal, então a confirmação explica a diferença e aponta para o seletor do menu.
function BotaoSair({ nome, carregando, desabilitado, onConfirmar }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <div className="w-full">
        <p className="mb-3 text-sm text-slate-500">
          Para só ver outro espaço, troque pelo seletor <strong>Espaço</strong> no menu. Você continua neste.
        </p>
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => setConfirmando(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-bold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-60"
        >
          <FaArrowRightFromBracket aria-hidden="true" />
          Sair do espaço
        </button>
      </div>
    );
  }
  return (
    <div role="alertdialog" aria-label="Confirmar saída do espaço" className="w-full rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">
        Sair de "{nome}"? Você deixa de ver as contas e os lançamentos deste espaço e só volta com um convite novo.
        Para apenas trocar de espaço, use o seletor no menu.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={carregando}
          aria-busy={carregando}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 disabled:opacity-70"
        >
          {carregando ? "Saindo..." : "Sim, sair do espaço"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => setConfirmando(false)}
          className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-slate-700 transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Familia() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [renomeando, setRenomeando] = useState(false);
  const [ocupado, setOcupado] = useState("");

  const carregar = useCallback(() => {
    api("/family")
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Executa uma ação e recarrega; mostra o erro do servidor (ex.: último dono)
  async function acao(chave, fn, { recarregarPagina = false } = {}) {
    setErro("");
    setAviso("");
    setOcupado(chave);
    try {
      await fn();
      if (recarregarPagina) return window.location.assign("/app");
      carregar();
    } catch (falha) {
      setErro(falha.message);
    }
    setOcupado("");
  }

  const h = dados?.household;
  const ehDono = h?.role === "OWNER";
  const donos = dados?.members.filter((m) => m.role === "OWNER").length ?? 0;
  const podeSair = h && !(ehDono && donos <= 1);

  return (
    <AppLayout semBotaoNovo>
      <Alerta>{erro}</Alerta>
      <Alerta tipo="sucesso">{aviso}</Alerta>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-500">{dados?.members?.length > 1 ? "Espaço compartilhado" : "Seu espaço"}</p>
          <h1 className="truncate font-heading text-2xl font-bold text-slate-900 md:text-4xl">{h?.name ?? "Família"}</h1>
          {h && <p className="mt-1 text-slate-600">Seu papel: {NOME_PAPEL[h.role]}</p>}
        </div>
        {ehDono && (
          <button type="button" onClick={() => setRenomeando(true)} className={botaoIcone} aria-label="Renomear espaço">
            <FaPen aria-hidden="true" />
          </button>
        )}
      </div>

      {dados === null && !erro && <p role="status" className="mt-6 text-slate-500">Carregando...</p>}

      {h?.isPersonal && ehDono && (
        <Alerta tipo="info" className="mt-6">
          Convide sua família para este espaço. Quem entrar vê tudo o que você já lançou aqui e lança junto. Cada pessoa continua com o próprio espaço pessoal, que só ela vê. Dica: renomeie este espaço no lápis (ex.: “Família Martins”).
        </Alerta>
      )}

      {dados && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="titulo-membros" className={cartao}>
            <h2 id="titulo-membros" className="font-heading text-xl font-bold text-slate-900">
              Pessoas ({dados.members.length})
            </h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {dados.members.map((m) => (
                <li key={m.userId} className="py-3">
                  <div className="flex items-center gap-3">
                    <Avatar pessoa={{ id: m.userId, name: m.name }} tamanho="h-11 w-11 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">
                        {m.name}
                        {m.isMe && <span className="ml-1 font-normal text-slate-500">(você)</span>}
                      </p>
                      <p className="truncate text-sm text-slate-500">{m.email}</p>
                      <p className="text-xs text-slate-500">
                        {NOME_PAPEL[m.role]} · desde {dataCurta(m.joinedAt)}
                      </p>
                    </div>
                  </div>
                  {ehDono && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 pl-14">
                      <CampoSelect
                        label={<span className="sr-only">Papel de {m.name}</span>}
                        value={m.role === "ADMIN" ? "MEMBER" : m.role}
                        disabled={ocupado === `papel-${m.userId}`}
                        onChange={(e) => acao(`papel-${m.userId}`, () => api(`/family/members/${m.userId}`, enviarJson("PATCH", { role: e.target.value })))}
                        className="min-w-44 flex-1 [&_label]:mb-0"
                      >
                        {PAPEIS.map((p) => (
                          <option key={p.valor} value={p.valor}>
                            {p.texto}
                          </option>
                        ))}
                      </CampoSelect>
                      {!m.isMe && (
                        <BotaoApagar
                          texto="Remover"
                          pergunta={`Remover ${m.name} do espaço? Os lançamentos dessa pessoa continuam aqui.`}
                          carregando={ocupado === `remover-${m.userId}`}
                          onConfirmar={() => acao(`remover-${m.userId}`, () => api(`/family/members/${m.userId}`, { method: "DELETE" }))}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {ehDono && (
            <div className="space-y-6">
              <Convidar onConvidado={carregar} />

              <section aria-labelledby="titulo-convites" className={cartao}>
                <h2 id="titulo-convites" className="font-heading text-xl font-bold text-slate-900">
                  Convites pendentes
                </h2>
                {dados.invites.length === 0 && <p className="mt-3 text-slate-500">Nenhum convite pendente.</p>}
                <ul className="mt-2 divide-y divide-slate-100">
                  {dados.invites.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-primary" aria-hidden="true">
                        {c.email ? <FaEnvelope /> : <FaLink />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{c.email ?? "Convite por link"}</p>
                        <p className="text-xs text-slate-500">
                          {NOME_PAPEL[c.role]} · vale até {dataCurta(c.expiresAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={botaoIcone}
                        disabled={Boolean(ocupado)}
                        aria-label={c.email ? `Reenviar convite para ${c.email}` : "Gerar e copiar um link novo"}
                        title={c.email ? "Reenviar" : "Copiar link novo"}
                        onClick={() =>
                          acao(`reenviar-${c.id}`, async () => {
                            const r = await api(`/family/invites/${c.id}/resend`, { method: "POST" });
                            if (c.email) setAviso(`Convite reenviado para ${c.email}.`);
                            else setAviso((await copiar(r.url)) ? "Link novo copiado. O anterior deixou de valer." : `Link novo: ${r.url}`);
                          })
                        }
                      >
                        {c.email ? <FaRotateRight aria-hidden="true" /> : <FaLink aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        className={`${botaoIcone} text-red-700`}
                        disabled={Boolean(ocupado)}
                        aria-label={`Cancelar convite ${c.email ?? "por link"}`}
                        title="Cancelar"
                        onClick={() => acao(`cancelar-${c.id}`, () => api(`/family/invites/${c.id}`, { method: "DELETE" }))}
                      >
                        <FaXmark aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {/* Sair do espaço / apagar o espaço */}
      {h && (podeSair || (ehDono && !h.isPersonal)) && (
        <section aria-label="Sair ou apagar o espaço" className={`${cartao} mt-6 flex flex-wrap items-center gap-3`}>
          {podeSair && (
            <BotaoSair
              nome={h.name}
              carregando={ocupado === "sair"}
              desabilitado={Boolean(ocupado)}
              onConfirmar={() => acao("sair", () => api("/family/leave", { method: "POST" }), { recarregarPagina: true })}
            />
          )}
          {ehDono && !h.isPersonal && (
            <BotaoApagar
              texto="Apagar espaço"
              pergunta={`Apagar "${h.name}" e TODOS os dados dele (contas, cartões, categorias e lançamentos) para todas as pessoas? Não dá para desfazer.`}
              carregando={ocupado === "apagar"}
              onConfirmar={() => acao("apagar", () => api("/family", { method: "DELETE" }), { recarregarPagina: true })}
            />
          )}
          {ehDono && donos <= 1 && dados.members.length > 1 && (
            <p className="w-full text-sm text-slate-500">Para sair, passe o papel de Dono para outra pessoa antes.</p>
          )}
        </section>
      )}

      {renomeando && (
        <Renomear
          nome={h.name}
          onFechar={() => setRenomeando(false)}
          onSalvo={() => window.location.reload()}
        />
      )}
    </AppLayout>
  );
}

export default Familia;
