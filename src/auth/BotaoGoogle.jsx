import { useEffect, useState } from "react";
import { FaGoogle } from "react-icons/fa6";
import { signIn } from "../lib/auth-client.js";
import { api } from "../lib/api.js";

// Botão "Entrar com Google": só aparece se o servidor tiver o Google configurado
function BotaoGoogle() {
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    api("/config").then((c) => setLigado(c.google)).catch(() => setLigado(false));
  }, []);

  if (!ligado) return null;

  const entrar = () => signIn.social({ provider: "google", callbackURL: `${window.location.origin}/app` });

  return (
    <>
      <div className="my-6 flex items-center gap-3 text-sm text-slate-500" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" /> ou <span className="h-px flex-1 bg-slate-200" />
      </div>
      <button
        type="button"
        onClick={entrar}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-6 font-bold text-slate-800 transition hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <FaGoogle aria-hidden="true" className="text-primary" /> Continuar com Google
      </button>
    </>
  );
}

export default BotaoGoogle;
