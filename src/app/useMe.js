import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Guarda a resposta de /api/me para o menu e a tela não pedirem duas vezes.
// Some ao recarregar a página (e ao sair, que recarrega).
let pedido = null;

// Dados do usuário logado e da família (GET /api/me).
// podeEditar = false para quem só visualiza (VIEWER): escondemos os botões de criar/editar/apagar.
export function useMe() {
  const [me, setMe] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!pedido) pedido = api("/me");
    let ativo = true;
    pedido
      .then((dados) => ativo && setMe(dados))
      .catch((e) => {
        pedido = null; // tenta de novo na próxima tela
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return { me, erroMe: erro, podeEditar: Boolean(me) && me.household.role !== "VIEWER" };
}
