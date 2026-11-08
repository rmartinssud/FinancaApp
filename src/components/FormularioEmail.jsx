import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ButtonArrow45 from "./ButtonArrow45.jsx";

// Campo de email com o botão de seta "dentro" da pílula.
// Usado no Hero e na chamada final (CTA): leva para /cadastro com o email preenchido.
function FormularioEmail({ textoBotao = "Criar conta", placeholder = "Digite seu email", className = "", claro = false }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const enviar = (e) => {
    e.preventDefault();
    const destino = email.trim() ? `/cadastro?email=${encodeURIComponent(email.trim())}` : "/cadastro";
    navigate(destino);
  };

  return (
    <div className={`w-full max-w-md ${className}`}>
      <form onSubmit={enviar} className="flex w-full items-center rounded-full bg-white p-1.5 shadow-lg focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
        <label htmlFor={`email-${textoBotao}`} className="sr-only">
          Seu email
        </label>
        <input
          id={`email-${textoBotao}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          autoComplete="email"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-slate-800 outline-none placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <ButtonArrow45 texto={textoBotao} type="submit" className="px-5 sm:px-6" />
      </form>
      <p className={`mt-3 text-sm ${claro ? "text-white/90" : "text-slate-600"}`}>
        Já tem conta?{" "}
        <Link
          to="/entrar"
          className={`inline-flex min-h-11 items-center rounded font-bold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 ${claro ? "text-white focus-visible:ring-white" : "text-primary focus-visible:ring-primary"}`}
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}

export default FormularioEmail;
