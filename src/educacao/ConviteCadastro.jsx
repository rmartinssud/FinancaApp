import { Link, useLocation } from "react-router-dom";
import { FaLock } from "react-icons/fa6";
import { classeFoco, linkCadastro, linkEntrar } from "./util.js";

// Conteúdo só para cadastrados, visto por quem não entrou: convite para criar a conta grátis.
// Depois do cadastro (ou do login) a pessoa volta para esta mesma página.
function ConviteCadastro({ oQue = "este conteúdo", materiais = 0 }) {
  const { pathname } = useLocation();
  return (
    <section aria-labelledby="titulo-convite" className="mt-5 rounded-3xl border border-primary/20 bg-gradient-to-br from-soft to-white p-5 text-center sm:p-8">
      <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl text-white shadow-lg">
        <FaLock />
      </span>
      <h2 id="titulo-convite" className="mt-3 font-heading text-xl font-bold text-slate-900 sm:text-2xl">
        Crie sua conta grátis para ver
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-slate-600">
        {`${oQue.charAt(0).toUpperCase()}${oQue.slice(1)} é exclusivo para quem tem conta no Famicash. O plano grátis já libera tudo`}
        {materiais > 0 ? `, inclusive ${materiais === 1 ? "o material para baixar" : `os ${materiais} materiais para baixar`}` : ""}.
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Link to={linkCadastro(pathname)} className={`inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 font-bold text-white shadow hover:bg-primary-dark sm:w-auto ${classeFoco}`}>
          Criar conta grátis
        </Link>
        <Link to={linkEntrar(pathname)} className={`inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 font-bold text-primary hover:bg-soft sm:w-auto ${classeFoco}`}>
          Já tenho conta
        </Link>
      </div>
    </section>
  );
}

export default ConviteCadastro;
