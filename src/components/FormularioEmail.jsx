import { useState } from "react";
import ButtonArrow45 from "./ButtonArrow45.jsx";

// Campo de email com o botão de seta "dentro" da pílula.
// Usado no Hero e na chamada final (CTA).
function FormularioEmail({ textoBotao = "Inscreva-se", placeholder = "Digite seu email", className = "" }) {
  const [enviado, setEnviado] = useState(false);

  const enviar = (e) => {
    e.preventDefault(); // TODO: enviar o email para a API quando ela existir
    setEnviado(true);
  };

  if (enviado) {
    return (
      <p className={`rounded-full bg-white px-6 py-4 font-medium text-primary ${className}`}>
        Obrigado! Avisaremos você no seu email. 🎉
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className={`flex w-full max-w-md items-center rounded-full bg-white p-1.5 shadow-lg ${className}`}>
      <label htmlFor={`email-${textoBotao}`} className="sr-only">
        Seu email
      </label>
      <input
        id={`email-${textoBotao}`}
        type="email"
        required
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-slate-800 outline-none placeholder:text-slate-400"
      />
      <ButtonArrow45 texto={textoBotao} type="submit" className="px-5 sm:px-6" />
    </form>
  );
}

export default FormularioEmail;
