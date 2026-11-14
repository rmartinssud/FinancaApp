import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

// Funções comuns dos editores de conteúdo e de curso (separadas dos componentes)

// Mesmo slug do servidor (para mostrar o endereço enquanto digita o título)
export function gerarSlug(texto) {
  return (
    String(texto ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || ""
  );
}

// Categorias e autores para os selects
export function useListasDoPainel() {
  const [categorias, setCategorias] = useState([]);
  const [autores, setAutores] = useState([]);
  useEffect(() => {
    api("/admin/educacao/categorias").then(setCategorias).catch(() => {});
    api("/admin/educacao/autores").then(setAutores).catch(() => {});
  }, []);
  return { categorias, autores };
}

// Converte o item da API para o formulário
export function formDoItem(item, padrao = {}) {
  return {
    title: item?.title ?? "",
    slug: item?.slug ?? "",
    summary: item?.summary ?? "",
    categoryId: item?.categoryId ?? "",
    authorId: item?.authorId ?? padrao.authorId ?? "",
    visibility: item?.visibility ?? "PUBLIC",
    tags: (item?.tags ?? []).join(", "),
    seoTitle: item?.seoTitle ?? "",
    seoDescription: item?.seoDescription ?? "",
    featured: Boolean(item?.featured),
  };
}

export function corpoComum(form, slugManual) {
  return {
    title: form.title,
    ...(slugManual && form.slug ? { slug: form.slug } : {}),
    summary: form.summary,
    categoryId: form.categoryId || null,
    authorId: form.authorId || null,
    visibility: form.visibility,
    tags: form.tags,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    featured: form.featured,
  };
}

