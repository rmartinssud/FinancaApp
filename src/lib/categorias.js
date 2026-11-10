// Categorias e subcategorias (um nível só: a filha tem parentId)

// Só as principais (sem pai), do tipo pedido
export const principais = (lista, tipo) => lista.filter((c) => !c.parentId && (!tipo || c.type === tipo));

// Subcategorias de uma categoria
export const filhasDe = (lista, id) => (id ? lista.filter((c) => c.parentId === id) : []);

// Lista em ordem "pai, filhas da pai, próxima pai..." com o rótulo "Mercado › Feira" nas filhas
export function comSubcategorias(lista, tipo) {
  const resultado = [];
  for (const pai of principais(lista, tipo)) {
    resultado.push({ ...pai, rotulo: pai.name, nivel: 0 });
    for (const f of filhasDe(lista, pai.id)) resultado.push({ ...f, rotulo: `${pai.name} › ${f.name}`, nivel: 1 });
  }
  return resultado;
}

// Nome de uma categoria vinda da API (com "parent" quando é subcategoria)
export const nomeCategoria = (c) => (c ? (c.parent ? `${c.parent.name} › ${c.name}` : c.name) : "Sem categoria");
