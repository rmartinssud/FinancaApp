import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Dados do usuário logado e da família (GET /api/me).
// podeEditar = false para quem só visualiza (VIEWER): escondemos os botões de criar/editar/apagar.
export function useMe() {
  const [me, setMe] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api("/me")
      .then(setMe)
      .catch((e) => setErro(e.message));
  }, []);

  return { me, erroMe: erro, podeEditar: Boolean(me) && me.household.role !== "VIEWER" };
}
