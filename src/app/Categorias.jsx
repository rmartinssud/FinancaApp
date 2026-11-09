import { useCallback, useEffect, useState } from "react";
import AppLayout from "./AppLayout.jsx";
import Modal from "./componentes/Modal.jsx";
import Alternador from "./componentes/Alternador.jsx";
import BotaoApagar from "./componentes/BotaoApagar.jsx";
import IconeCategoria from "./componentes/IconeCategoria.jsx";
import SeletorIcone from "./componentes/SeletorIcone.jsx";
import { cartao } from "./componentes/estilos.js";
import { useMe } from "./useMe.js";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import { api, enviarJson, errosPorCampo } from "../lib/api.js";
import { CORES_CATEGORIA } from "../lib/icones.js";

const tiposCategoria = [
  { valor: "EXPENSE", texto: "Despesa" },
  { valor: "INCOME", texto: "Receita" },
];

// Grade de opções com radios escondidos (cor ou ícone)
function GradeOpcoes({ legenda, nome, opcoes, valor, onMudar, erro, renderizar }) {
  return (
    <fieldset>
      <legend className="mb-2 block font-medium text-slate-800">{legenda}</legend>
      <div className="grid grid-cols-5 gap-2">
        {opcoes.map((o) => (
          <label key={o.valor} className="flex justify-center">
            <input type="radio" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => onMudar(o.valor)} className="peer sr-only" aria-label={o.nome} />
            <span
              className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40 ${
                valor === o.valor ? "border-slate-900" : "border-transparent"
              }`}
            >
              {renderizar(o, valor === o.valor)}
            </span>
          </label>
        ))}
      </div>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </fieldset>
  );
}

// Janela para criar ou editar uma categoria
function FormCategoria({ categoria, tipoInicial, onFechar, onSalvo }) {
  const editando = Boolean(categoria);
  const [nome, setNome] = useState(categoria?.name ?? "");
  const [tipo, setTipo] = useState(categoria?.type ?? tipoInicial);
  const [cor, setCor] = useState(categoria?.color ?? CORES_CATEGORIA[0].cor);
  const [icone, setIcone] = useState(categoria?.icon ?? "cart");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  // Uma cor personalizada (fora da lista) continua disponível na edição
  const cores = CORES_CATEGORIA.map((c) => ({ valor: c.cor, nome: c.nome }));
  if (!cores.some((c) => c.valor.toLowerCase() === cor.toLowerCase())) cores.push({ valor: cor, nome: "Cor atual" });

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return setErros({ name: "Dê um nome para a categoria." });
    setErros({});
    setErro("");
    const corpo = { name: nome.trim(), color: cor, icon: icone };
    setSalvando(true);
    try {
      if (editando) await api(`/categories/${categoria.id}`, enviarJson("PATCH", corpo));
      else await api("/categories", enviarJson("POST", { ...corpo, type: tipo }));
      onSalvo();
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(falha.message);
      setSalvando(false);
    }
  }

  async function apagar() {
    setApagando(true);
    try {
      await api(`/categories/${categoria.id}`, { method: "DELETE" });
      onSalvo();
    } catch (falha) {
      setErro(falha.message);
      setApagando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar categoria" : "Nova categoria"} onFechar={onFechar}>
      <form onSubmit={salvar} noValidate className="space-y-5">
        <Alerta>{erro}</Alerta>

        {/* O tipo não muda depois de criada (os lançamentos dependem dele) */}
        {editando ? (
          <p className="rounded-2xl bg-soft p-3 text-sm text-primary-dark">
            Categoria de <strong>{tipo === "INCOME" ? "receita" : "despesa"}</strong>. O tipo não pode ser alterado.
          </p>
        ) : (
          <Alternador legenda="Tipo" nome="tipo-categoria" opcoes={tiposCategoria} valor={tipo} onMudar={setTipo} />
        )}

        <div className="flex items-end gap-3">
          <IconeCategoria categoria={{ color: cor, icon: icone }} tamanho="h-12 w-12 text-xl" />
          <Campo label="Nome" maxLength={40} autoComplete="off" placeholder="Ex.: Farmácia" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.name} className="flex-1" />
        </div>

        <GradeOpcoes
          legenda="Cor"
          nome="cor-categoria"
          opcoes={cores}
          valor={cor}
          onMudar={setCor}
          erro={erros.color}
          renderizar={(o) => <span aria-hidden="true" className="h-9 w-9 rounded-xl" style={{ backgroundColor: o.valor }} />}
        />

        <SeletorIcone valor={icone} onMudar={setIcone} cor={cor} erro={erros.icon} />

        <BotaoEnviar texto={editando ? "Salvar alterações" : "Criar categoria"} carregando={salvando} textoCarregando="Salvando..." className="w-full" />

        {editando && (
          <div className="flex justify-center">
            <BotaoApagar
              texto="Apagar categoria"
              pergunta="Apagar esta categoria? Os lançamentos dela continuam, mas ficam sem categoria."
              onConfirmar={apagar}
              carregando={apagando}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}

// Categorias de despesa e de receita da família
function Categorias() {
  const { erroMe, podeEditar } = useMe();
  const [categorias, setCategorias] = useState(null);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState(null);
  const [tipoNovo, setTipoNovo] = useState("EXPENSE");

  const carregar = useCallback(() => {
    api("/categories")
      .then(setCategorias)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <AppLayout>
      <Alerta>{erroMe || erro}</Alerta>

      <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-4xl">Categorias</h1>
      {categorias === null && !erro && <p role="status" className="mt-6 text-slate-500">Carregando categorias...</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {tiposCategoria.map(({ valor: tipo }) => {
          const daVez = (categorias ?? []).filter((c) => c.type === tipo);
          const titulo = tipo === "EXPENSE" ? "Despesas" : "Receitas";
          return (
            <section key={tipo} aria-labelledby={`titulo-${tipo}`} className={cartao}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`titulo-${tipo}`} className="font-heading text-xl font-bold text-slate-900">
                  {titulo}
                </h2>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => {
                      setTipoNovo(tipo);
                      setEdicao("nova");
                    }}
                    className="inline-flex min-h-11 items-center rounded-full px-3 font-bold text-primary hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                  >
                    + Nova<span className="sr-only"> categoria de {titulo.toLowerCase()}</span>
                  </button>
                )}
              </div>
              {categorias && daVez.length === 0 && <p className="mt-4 text-slate-500">Nenhuma categoria ainda.</p>}
              <ul className="mt-2 divide-y divide-slate-100">
                {daVez.map((c) => (
                  <li key={c.id}>
                    {podeEditar ? (
                      <button
                        type="button"
                        onClick={() => setEdicao(c)}
                        aria-label={`Editar categoria ${c.name}`}
                        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left font-bold text-slate-900 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                      >
                        <IconeCategoria categoria={c} />
                        {c.name}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2 font-bold text-slate-900">
                        <IconeCategoria categoria={c} />
                        {c.name}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {edicao && (
        <FormCategoria
          categoria={edicao === "nova" ? null : edicao}
          tipoInicial={tipoNovo}
          onFechar={() => setEdicao(null)}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}

export default Categorias;
// Usado também no formulário de lançamento (botão + ao lado da categoria)
export { FormCategoria };
