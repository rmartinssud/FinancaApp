// Conteúdos de EXEMPLO da Educação financeira, só para desenvolvimento e testes.
// Produção começa vazia (a página mostra "Em breve"): este script se recusa a rodar com NODE_ENV=production.
// Rodar no dev:  npm run educacao:seed
import "dotenv/config";
import { fileURLToPath } from "node:url";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

export async function criarExemplosEducacao() {
  if (process.env.NODE_ENV === "production") throw new Error("Os exemplos da Educação financeira não são criados em produção.");
  const agora = new Date();

  const categoria = (name: string, slug: string, position: number) =>
    prisma.eduCategory.upsert({ where: { slug }, update: {}, create: { name, slug, position } });
  const educacao = await categoria("Educação financeira", "educacao-financeira", 1);
  const dividas = await categoria("Dívidas", "dividas", 2);
  await categoria("Investimentos", "investimentos", 3);

  const autor =
    (await prisma.eduAuthor.findFirst({ where: { name: "Equipe Famicash" } })) ??
    (await prisma.eduAuthor.create({ data: { name: "Equipe Famicash", bio: "Dicas práticas para organizar o dinheiro da família." } }));

  const conteudo = (slug: string, dados: Prisma.EduContentUncheckedCreateInput) => prisma.eduContent.upsert({ where: { slug }, update: {}, create: dados });

  const orcamento = await conteudo("como-montar-o-orcamento-da-familia", {
    slug: "como-montar-o-orcamento-da-familia",
    title: "Como montar o orçamento da família em 5 passos",
    summary: "Um roteiro simples para saber quanto entra, quanto sai e quanto sobra todo mês.",
    body: [
      "## 1. Anote tudo o que entra",
      "Salários, bicos e qualquer renda extra. Use o valor **líquido**, que cai na conta.",
      "## 2. Liste as despesas fixas",
      "- Aluguel ou financiamento",
      "- Contas de luz, água e internet",
      "- Escola e plano de saúde",
      "## 3. Estime as despesas variáveis",
      "Mercado, transporte e lazer mudam todo mês. Olhe os últimos 3 meses e tire a média.",
      "> **Dica:** no Famicash, a tela de Orçamentos faz essa conta para você.",
    ].join("\n\n"),
    visibility: "PUBLIC",
    status: "PUBLISHED",
    featured: true,
    publishedAt: agora,
    tags: ["orçamento", "família"],
    categoryId: educacao.id,
    authorId: autor.id,
  });

  // Vídeo de exemplo (ID público qualquer do YouTube; troque por um vídeo real do Famicash)
  await conteudo("reserva-de-emergencia-em-video", {
    slug: "reserva-de-emergencia-em-video",
    title: "Reserva de emergência: por onde começar",
    summary: "Vídeo curto explicando quanto guardar e onde deixar o dinheiro da reserva.",
    body: "",
    videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    videoId: "aqz-KE-bpKQ",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    publishedAt: agora,
    tags: ["reserva", "emergência"],
    categoryId: educacao.id,
    authorId: autor.id,
  });

  const aula1 = await conteudo("dividas-aula-1-o-tamanho-do-problema", {
    slug: "dividas-aula-1-o-tamanho-do-problema",
    title: "Aula 1: o tamanho do problema",
    summary: "Liste todas as dívidas, com juros e parcelas, antes de decidir o que pagar primeiro.",
    body: "## Faça a lista\n\nPara cada dívida, anote: **quanto falta**, **juros ao mês** e **valor da parcela**.\n\n> Cadastre as dívidas no Famicash para ver o total na tela de Dívidas.",
    videoUrl: "https://youtu.be/aqz-KE-bpKQ",
    videoId: "aqz-KE-bpKQ",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    listed: false,
    publishedAt: agora,
    categoryId: dividas.id,
    authorId: autor.id,
  });
  const aula2 = await conteudo("dividas-aula-2-avalanche-ou-bola-de-neve", {
    slug: "dividas-aula-2-avalanche-ou-bola-de-neve",
    title: "Aula 2: avalanche ou bola de neve?",
    summary: "Dois métodos para quitar dívidas e como escolher o seu.",
    body: "## Avalanche\n\nPaga primeiro a dívida com **juros mais altos**.\n\n## Bola de neve\n\nPaga primeiro a **menor dívida**, para ganhar motivação.",
    visibility: "REGISTERED",
    status: "PUBLISHED",
    listed: false,
    publishedAt: agora,
    categoryId: dividas.id,
    authorId: autor.id,
  });

  const curso = await prisma.eduCourse.upsert({
    where: { slug: "como-sair-das-dividas" },
    update: {},
    create: {
      slug: "como-sair-das-dividas",
      title: "Como sair das dívidas",
      summary: "Curso grátis em aulas curtas: do diagnóstico ao plano de pagamento.",
      description: "Neste curso você vai **listar suas dívidas**, entender os juros e montar um plano para quitar tudo.",
      visibility: "PUBLIC",
      status: "PUBLISHED",
      featured: true,
      publishedAt: agora,
      categoryId: dividas.id,
      authorId: autor.id,
    },
  });
  await prisma.eduCourseLesson.createMany({
    data: [aula1, aula2].map((a, i) => ({ courseId: curso.id, contentId: a.id, position: i })),
    skipDuplicates: true,
  });
  return { orcamento, curso };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  criarExemplosEducacao()
    .then(() => console.log("Educação financeira: exemplos criados."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
