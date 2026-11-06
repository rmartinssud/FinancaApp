import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaWallet, FaBuildingColumns, FaCreditCard, FaShieldHalved, FaUsers } from "react-icons/fa6";
import AppLayout from "./AppLayout.jsx";
import Alerta from "../auth/Alerta.jsx";
import { Destaque } from "../components/SectionTitle.jsx";
import { api, formatarReais } from "../lib/api.js";

// Ícone e nome de cada tipo de conta
const tipos = {
  WALLET: { Icone: FaWallet, nome: "Carteira" },
  BANK: { Icone: FaBuildingColumns, nome: "Conta bancária" },
  CREDIT_CARD: { Icone: FaCreditCard, nome: "Cartão de crédito" },
};

const papeis = { OWNER: "Dono(a)", ADMIN: "Administrador(a)", MEMBER: "Membro", VIEWER: "Só visualiza" };

// Painel inicial (provisório): saudação, família e lista de contas
function Inicio() {
  const [me, setMe] = useState(null);
  const [contas, setContas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([api("/me"), api("/accounts")])
      .then(([dadosMe, dadosContas]) => {
        setMe(dadosMe);
        setContas(dadosContas);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const primeiroNome = me?.user.name.split(" ")[0];

  return (
    <AppLayout>
      <Alerta>{erro}</Alerta>

      <section aria-labelledby="saudacao">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">Painel</p>
        <h1 id="saudacao" className="mt-2 font-heading text-4xl font-bold text-slate-900 md:text-5xl">
          Olá, <Destaque>{primeiroNome ?? "..."}</Destaque>
        </h1>
        <p className="mt-3 text-lg text-slate-600">Aqui fica o resumo das finanças da sua família.</p>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* Cartão da família */}
        <section aria-labelledby="titulo-familia" className="rounded-3xl bg-gradient-to-br from-primary to-primary-light p-8 text-white shadow-[0_20px_50px_-12px_rgba(70,79,163,0.35)]">
          <FaUsers aria-hidden="true" className="text-3xl text-sky-200" />
          <h2 id="titulo-familia" className="mt-6 text-sm font-bold uppercase tracking-widest text-sky-200">
            Sua família
          </h2>
          <p className="mt-2 font-heading text-3xl font-bold">{me?.household.name ?? "..."}</p>
          {me && <p className="mt-2 text-white/80">Seu papel: {papeis[me.household.role]}</p>}
        </section>

        {/* Lista de contas */}
        <section aria-labelledby="titulo-contas" className="rounded-3xl bg-white p-8 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] lg:col-span-2">
          <h2 id="titulo-contas" className="font-heading text-2xl font-bold text-slate-900">
            Suas contas
          </h2>
          <ul className="mt-6 divide-y divide-slate-100">
            {contas.map((conta) => {
              const { Icone, nome } = tipos[conta.type];
              return (
                <li key={conta.id} className="flex items-center gap-4 py-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-soft text-xl text-primary">
                    <Icone aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{conta.name}</p>
                    <p className="text-sm text-slate-500">{nome}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Saldo inicial</p>
                    <p className="font-bold text-slate-900">{formatarReais(conta.initialBalance)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {me && contas.length === 0 && <p className="mt-6 text-slate-500">Nenhuma conta ainda.</p>}
          <p className="mt-6 rounded-2xl bg-soft p-4 text-sm text-primary-dark">
            Em breve: cadastrar contas bancárias e cartões, lançar receitas e despesas.
          </p>
        </section>
      </div>

      {/* Lembrete de segurança quando o 2FA está desligado */}
      {me && !me.user.twoFactorEnabled && (
        <section className="mt-6 flex flex-col items-start gap-4 rounded-3xl bg-white p-6 shadow-[0_20px_50px_-12px_rgba(70,79,163,0.2)] sm:flex-row sm:items-center">
          <FaShieldHalved aria-hidden="true" className="text-3xl text-accent" />
          <p className="flex-1 text-slate-700">
            <strong>Proteja sua conta:</strong> ative a verificação em duas etapas com um app autenticador.
          </p>
          <Link
            to="/app/seguranca"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-white hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Ativar agora
          </Link>
        </section>
      )}
    </AppLayout>
  );
}

export default Inicio;
