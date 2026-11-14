import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

// Papel do usuário no painel de conteúdo: { role: "EDITOR" | "ADMIN", authorId }.
// semAcesso = true para quem não é da equipe (a API responde 403).
export function useEquipe() {
  const [papel, setPapel] = useState(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    api("/admin/educacao/papel")
      .then(setPapel)
      .catch((e) => (e.status === 403 ? setSemAcesso(true) : setErro(e.message)));
  }, []);
  return { papel, ehAdmin: papel?.role === "ADMIN", semAcesso, erro, carregando: !papel && !semAcesso && !erro };
}
