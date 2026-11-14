import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { idDoYoutube, gerarSlug } from "../src/services/educacao/regras.js";
import { tipoDoMaterial } from "../src/services/educacao/arquivos.js";
import { criarExemplosEducacao } from "../scripts/seed-educacao.js";
import { usuarioLogado, cadastrar, emailUnico, ORIGIN } from "./helpers.js";

const app = createApp();
type Agent = Awaited<ReturnType<typeof usuarioLogado>>["agent"];

let admin: Agent;
let adminEmail: string;
let editor: Agent;
let editorEmail: string;
let outroEditor: Agent;
let leitor: Agent;
const anonimo = () => request(app);
const ADMIN_ANTES = process.env.ADMIN_EMAILS;
const sufixo = Math.random().toString(36).slice(2, 7);

async function criarConteudo(agent: Agent, dados: Record<string, unknown>) {
  const r = await agent.post("/api/admin/educacao/conteudos").send({ body: "Texto do artigo com **negrito**.", ...dados });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string; slug: string; status: string };
}
const publicar = (id: string, publishedAt?: string) => admin.post(`/api/admin/educacao/conteudos/${id}/publicar`).send(publishedAt ? { publishedAt } : {});

beforeAll(async () => {
  ({ agent: admin, email: adminEmail } = await usuarioLogado(app, "Robson Admin"));
  process.env.ADMIN_EMAILS = ` outro@exemplo.com , ${adminEmail.toUpperCase()} `;
  ({ agent: editor, email: editorEmail } = await usuarioLogado(app, "Parceira Editora"));
  const outro = await usuarioLogado(app, "Outro Editor");
  outroEditor = outro.agent;
  ({ agent: leitor } = await usuarioLogado(app, "Leitora Comum"));
  for (const email of [editorEmail, outro.email]) {
    const r = await admin.post("/api/admin/educacao/equipe").send({ email, role: "EDITOR" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
});

afterAll(() => {
  process.env.ADMIN_EMAILS = ADMIN_ANTES;
});

describe("Educação: regras puras", () => {
  it("lê o ID do YouTube de vários formatos de link", () => {
    expect(idDoYoutube("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10")).toBe("aqz-KE-bpKQ");
    expect(idDoYoutube("https://youtu.be/aqz-KE-bpKQ?si=x")).toBe("aqz-KE-bpKQ");
    expect(idDoYoutube("youtube.com/shorts/aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
    expect(idDoYoutube("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
    expect(idDoYoutube("aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
    expect(idDoYoutube("https://vimeo.com/123")).toBeNull();
    expect(idDoYoutube("https://evil.com/watch?v=aqz-KE-bpKQ")).toBeNull();
  });

  it("gera slug amigável sem acentos", () => {
    expect(gerarSlug("Como sair das Dívidas: guia 2026!")).toBe("como-sair-das-dividas-guia-2026");
  });

  it("confere o tipo do material pelo conteúdo, não só pelo nome", () => {
    expect(tipoDoMaterial(Buffer.from("%PDF-1.4 ..."), "x.pdf")?.ext).toBe("pdf");
    expect(tipoDoMaterial(Buffer.from("data;valor\n1;2\n"), "planilha.csv")?.mime).toBe("text/csv");
    expect(tipoDoMaterial(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "planilha.xlsx")?.ext).toBe("xlsx");
    expect(tipoDoMaterial(Buffer.from("MZ\x00\x01binario"), "virus.csv")).toBeNull();
    expect(tipoDoMaterial(Buffer.from("<html><script>alert(1)</script>"), "pagina.html")).toBeNull();
  });
});

describe("Educação: papéis da plataforma", () => {
  it("usuário comum não entra no painel", async () => {
    expect((await leitor.get("/api/admin/educacao/conteudos")).status).toBe(403);
    expect((await anonimo().get("/api/admin/educacao/conteudos")).status).toBe(401);
    const me = await leitor.get("/api/me");
    expect(me.body.platformRole).toBe("USER");
  });

  it("ADMIN vem de ADMIN_EMAILS (sem diferenciar maiúsculas) e aparece em /api/me", async () => {
    const me = await admin.get("/api/me");
    expect(me.body.platformRole).toBe("ADMIN");
    const papel = await editor.get("/api/admin/educacao/papel");
    expect(papel.body.role).toBe("EDITOR");
    // Editor novo ganha perfil de autor
    expect(papel.body.authorId).toBeTruthy();
  });

  it("email em ADMIN_EMAILS sem confirmar não vira ADMIN", async () => {
    const email = emailUnico();
    await cadastrar(app, email);
    process.env.ADMIN_EMAILS = `${process.env.ADMIN_EMAILS},${email}`;
    const u = await prisma.user.findUnique({ where: { email } });
    const { papelEfetivo } = await import("../src/services/educacao/papeis.js");
    expect(papelEfetivo(u!)).toBe("USER");
  });

  it("só ADMIN gerencia a equipe; precisa existir conta", async () => {
    expect((await editor.get("/api/admin/educacao/equipe")).status).toBe(403);
    expect((await editor.post("/api/admin/educacao/equipe").send({ email: "x@y.com", role: "EDITOR" })).status).toBe(403);
    const r = await admin.post("/api/admin/educacao/equipe").send({ email: "ninguem-aqui@exemplo.com", role: "EDITOR" });
    expect(r.status).toBe(400);
    expect(r.body.detalhes.email[0]).toMatch(/criar a conta/);
    const proprio = await admin.post("/api/admin/educacao/equipe").send({ email: adminEmail, role: "USER" });
    expect(proprio.status).toBe(400);
    const lista = await admin.get("/api/admin/educacao/equipe");
    expect(lista.body.find((p: { email: string }) => p.email === editorEmail).role).toBe("EDITOR");
    expect(lista.body.find((p: { email: string }) => p.email === adminEmail).viaEnv).toBe(true);
  });

  it("EDITOR cria e edita o seu, não publica, envia para revisão e não mexe no dos outros", async () => {
    const c = await criarConteudo(editor, { title: `Rascunho da editora ${sufixo}` });
    expect(c.status).toBe("DRAFT");
    expect((await editor.post(`/api/admin/educacao/conteudos/${c.id}/publicar`).send({})).status).toBe(403);
    expect((await outroEditor.put(`/api/admin/educacao/conteudos/${c.id}`).send({ title: "Invadido" })).status).toBe(404);
    expect((await outroEditor.delete(`/api/admin/educacao/conteudos/${c.id}`)).status).toBe(404);

    const enviado = await editor.post(`/api/admin/educacao/conteudos/${c.id}/enviar`);
    expect(enviado.status).toBe(200);
    expect(enviado.body.submittedAt).toBeTruthy();
    const pendentes = await admin.get("/api/admin/educacao/conteudos?status=SUBMITTED");
    expect(pendentes.body.some((x: { id: string }) => x.id === c.id)).toBe(true);

    // EDITOR não marca destaque (campo só do ADMIN)
    const ed = await editor.put(`/api/admin/educacao/conteudos/${c.id}`).send({ title: `Rascunho da editora ${sufixo}`, body: "Novo texto", featured: true });
    expect(ed.status).toBe(200);
    expect(ed.body.featured).toBe(false);

    const pub = await publicar(c.id);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe("PUBLISHED");
    expect(pub.body.submittedAt).toBeNull();

    // Publicado: EDITOR não altera nem apaga mais
    expect((await editor.put(`/api/admin/educacao/conteudos/${c.id}`).send({ title: "Mudou depois" })).status).toBe(403);
    expect((await editor.delete(`/api/admin/educacao/conteudos/${c.id}`)).status).toBe(403);
    // Outro editor vê o publicado no painel, mas não altera
    expect((await outroEditor.get(`/api/admin/educacao/conteudos/${c.id}`)).body.canEdit).toBe(false);
  });

  it("valida slug repetido/reservado e link do YouTube", async () => {
    const a = await criarConteudo(admin, { title: `Título repetido ${sufixo}` });
    const b = await criarConteudo(admin, { title: `Título repetido ${sufixo}` });
    expect(b.slug).toBe(`${a.slug}-2`);
    const rep = await admin.post("/api/admin/educacao/conteudos").send({ title: "Outro", slug: a.slug });
    expect(rep.status).toBe(400);
    expect(rep.body.detalhes.slug).toBeTruthy();
    const res = await admin.post("/api/admin/educacao/conteudos").send({ title: "Outro", slug: "cursos" });
    expect(res.body.detalhes.slug[0]).toMatch(/reservado/);
    const yt = await admin.post("/api/admin/educacao/conteudos").send({ title: "Vídeo", videoUrl: "https://vimeo.com/1" });
    expect(yt.body.detalhes.videoUrl).toBeTruthy();
    const vip = await admin.post("/api/admin/educacao/conteudos").send({ title: "VIP", visibility: "VIP" });
    expect(vip.status).toBe(400);
  });

  it("não publica conteúdo vazio (sem texto e sem vídeo)", async () => {
    const c = await criarConteudo(admin, { title: `Vazio ${sufixo}`, body: "" });
    const r = await publicar(c.id);
    expect(r.status).toBe(400);
  });
});

describe("Educação: visibilidade nas páginas públicas", () => {
  let publico: { id: string; slug: string };
  let cadastrados: { id: string; slug: string };
  let rascunho: { id: string; slug: string };
  let agendado: { id: string; slug: string };
  let vip: string;

  beforeAll(async () => {
    publico = await criarConteudo(admin, { title: `Artigo público ${sufixo}`, summary: "Resumo público", videoUrl: "https://youtu.be/aqz-KE-bpKQ" });
    await publicar(publico.id);
    cadastrados = await criarConteudo(admin, { title: `Artigo só cadastrados ${sufixo}`, summary: "Resumo restrito", body: "Segredo do texto", visibility: "REGISTERED", videoUrl: "aqz-KE-bpKQ" });
    await publicar(cadastrados.id);
    rascunho = await criarConteudo(admin, { title: `Artigo rascunho ${sufixo}` });
    agendado = await criarConteudo(admin, { title: `Artigo agendado ${sufixo}` });
    await publicar(agendado.id, new Date(Date.now() + 86400000).toISOString());
    const v = await criarConteudo(admin, { title: `Artigo VIP ${sufixo}` });
    await prisma.eduContent.update({ where: { id: v.id }, data: { visibility: "VIP", status: "PUBLISHED", publishedAt: new Date() } });
    vip = (await prisma.eduContent.findUnique({ where: { id: v.id } }))!.slug;
  });

  it("deslogado: público por inteiro; cadastrados só título e resumo (locked)", async () => {
    const r = await anonimo().get(`/api/educacao/conteudos/${publico.slug}`);
    expect(r.status).toBe(200);
    expect(r.body.locked).toBe(false);
    expect(r.body.body).toContain("negrito");
    expect(r.body.video.id).toBe("aqz-KE-bpKQ");
    expect(r.body.kind).toBe("MISTO");

    const b = await anonimo().get(`/api/educacao/conteudos/${cadastrados.slug}`);
    expect(b.status).toBe(200);
    expect(b.body.locked).toBe(true);
    expect(b.body.title).toContain("só cadastrados");
    expect(b.body.summary).toBe("Resumo restrito");
    expect(b.body.body).toBeNull();
    expect(b.body.video).toBeNull();
    expect(JSON.stringify(b.body)).not.toContain("Segredo do texto");
  });

  it("logado (plano grátis): abre o conteúdo para cadastrados", async () => {
    const b = await leitor.get(`/api/educacao/conteudos/${cadastrados.slug}`);
    expect(b.body.locked).toBe(false);
    expect(b.body.body).toBe("Segredo do texto");
  });

  it("rascunho, agendado e VIP não aparecem para o público", async () => {
    for (const slug of [rascunho.slug, agendado.slug, vip]) {
      expect((await anonimo().get(`/api/educacao/conteudos/${slug}`)).status).toBe(404);
      expect((await leitor.get(`/api/educacao/conteudos/${slug}`)).status).toBe(404);
    }
    const home = await anonimo().get("/api/educacao");
    const slugs = home.body.contents.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain(publico.slug);
    expect(slugs).toContain(cadastrados.slug);
    expect(slugs).not.toContain(rascunho.slug);
    expect(slugs).not.toContain(agendado.slug);
    expect(slugs).not.toContain(vip);
    expect(home.body.contents.find((c: { slug: string }) => c.slug === cadastrados.slug).locked).toBe(true);
    // Lista nunca leva o corpo
    expect(JSON.stringify(home.body)).not.toContain("Segredo do texto");
  });

  it("equipe vê a prévia do rascunho; ADMIN abre VIP", async () => {
    const p = await admin.get(`/api/educacao/conteudos/${rascunho.slug}`);
    expect(p.status).toBe(200);
    expect(p.body.preview).toBe(true);
    expect((await admin.get(`/api/educacao/conteudos/${vip}`)).status).toBe(200);
    expect((await editor.get(`/api/educacao/conteudos/${rascunho.slug}`)).status).toBe(404); // rascunho de outro
  });

  it("busca sem acentos e filtro por categoria", async () => {
    const cat = await admin.post("/api/admin/educacao/categorias").send({ name: `Investimentos ${sufixo}` });
    expect(cat.status).toBe(201);
    expect((await editor.post("/api/admin/educacao/categorias").send({ name: "Proibida" })).status).toBe(403);
    const c = await criarConteudo(admin, { title: `Começando a investir ${sufixo}`, categoryId: cat.body.id, body: "Tesouro Direto e CDB." });
    await publicar(c.id);
    const busca = await anonimo().get(`/api/educacao?q=${encodeURIComponent(`comecando tesouro ${sufixo}`)}`);
    expect(busca.body.contents.map((x: { slug: string }) => x.slug)).toEqual([c.slug]);
    const filtro = await anonimo().get(`/api/educacao?categoria=${cat.body.slug}`);
    expect(filtro.body.contents.map((x: { slug: string }) => x.slug)).toEqual([c.slug]);
    expect(filtro.body.categories.some((x: { slug: string }) => x.slug === cat.body.slug)).toBe(true);
  });

  it("SEO: head com Open Graph e JSON-LD; cadastrados com noindex; HTML escapado", async () => {
    const h = await anonimo().get(`/api/seo/head?path=${encodeURIComponent(`/educacao/${publico.slug}?utm=1`)}`);
    expect(h.status).toBe(200);
    expect(h.text).toContain(`<title>Artigo público ${sufixo} · Famicash</title>`);
    expect(h.text).toContain('content="index, follow"');
    expect(h.text).toContain('property="og:image" content="https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg"');
    expect(h.text).toContain('"@type":"Article"');
    expect(h.text).toContain(`<link rel="canonical" href="http://localhost:5173/educacao/${publico.slug}" />`);

    const r = await anonimo().get(`/api/seo/head?path=/educacao/${cadastrados.slug}`);
    expect(r.text).toContain("noindex");
    expect(r.text).toContain("Resumo restrito"); // a prévia do WhatsApp mostra título e resumo
    expect(r.text).not.toContain("Segredo do texto");

    const mau = await criarConteudo(admin, { title: `</title><script>alert(1)</script> ${sufixo}`, summary: '"><img src=x onerror=alert(1)>' });
    await publicar(mau.id);
    const x = await anonimo().get(`/api/seo/head?path=/educacao/${mau.slug}`);
    expect(x.text).not.toContain("<script>alert");
    expect(x.text).not.toContain('"><img');
    expect(x.text).toContain("&lt;/title&gt;");

    const desconhecido = await anonimo().get("/api/seo/head?path=/educacao/nao-existe");
    expect(desconhecido.text).toContain("<title>Educação financeira · Famicash</title>");
    expect(desconhecido.text).toContain("noindex");
  });

  it("sitemap só com o que é público e está no ar; robots aponta para ele", async () => {
    const s = await anonimo().get("/api/seo/sitemap.xml");
    expect(s.status).toBe(200);
    expect(s.headers["content-type"]).toContain("application/xml");
    expect(s.text).toContain(`<loc>http://localhost:5173/educacao/${publico.slug}</loc>`);
    expect(s.text).toContain("<loc>http://localhost:5173/educacao</loc>");
    expect(s.text).toContain("<loc>http://localhost:5173/ajuda/educacao-financeira</loc>");
    for (const slug of [cadastrados.slug, rascunho.slug, agendado.slug, vip]) expect(s.text).not.toContain(`/educacao/${slug}<`);
    const r = await anonimo().get("/api/seo/robots.txt");
    expect(r.text).toContain("Sitemap: http://localhost:5173/sitemap.xml");
    expect(r.text).toContain("Disallow: /app/");
  });
});

describe("Educação: materiais, capa, cursos e progresso", () => {
  it("materiais: download respeita a visibilidade; tipos perigosos recusados", async () => {
    const c = await criarConteudo(admin, { title: `Com planilha ${sufixo}`, visibility: "REGISTERED" });
    const up = await admin
      .post(`/api/admin/educacao/conteudos/${c.id}/materiais`)
      .set("Content-Type", "text/csv")
      .set("X-File-Name", encodeURIComponent("Orçamento família.csv"))
      .set("X-Title", encodeURIComponent("Planilha de orçamento"))
      .send(Buffer.from("categoria;valor\nmercado;800\n"));
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.title).toBe("Planilha de orçamento");

    const ruim = await admin.post(`/api/admin/educacao/conteudos/${c.id}/materiais`).set("Content-Type", "text/html").set("X-File-Name", "x.html").send(Buffer.from("<html><script>1</script>"));
    expect(ruim.status).toBe(400);
    expect((await leitor.post(`/api/admin/educacao/conteudos/${c.id}/materiais`).set("X-File-Name", "a.csv").send(Buffer.from("a;b"))).status).toBe(403);

    // Rascunho: ninguém de fora baixa
    expect((await leitor.get(up.body.url)).status).toBe(404);
    await publicar(c.id);
    expect((await anonimo().get(up.body.url)).status).toBe(401);
    const ok = await leitor.get(up.body.url).buffer(true);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(ok.headers["content-disposition"]).toContain(encodeURIComponent("Orçamento família.csv"));
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");

    // Bloqueado para deslogado: a página não lista os materiais
    const pagina = await anonimo().get(`/api/educacao/conteudos/${c.slug}`);
    expect(pagina.body.materials).toEqual([]);
    expect(pagina.body.materialsCount).toBe(1);

    expect((await admin.delete(`/api/admin/educacao/materiais/${up.body.id}`)).status).toBe(204);
    expect((await leitor.get(up.body.url)).status).toBe(404);
  });

  it("capa: foto vira JPEG e é servida publicamente só se estiver no banco", async () => {
    const c = await criarConteudo(admin, { title: `Com capa ${sufixo}` });
    const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#464fa3" } }).png().toBuffer();
    const r = await admin.post(`/api/admin/educacao/conteudos/${c.id}/capa`).set("Content-Type", "image/png").send(png);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.coverUrl).toMatch(/^\/api\/educacao\/capas\/[0-9a-f]{2}\/[0-9a-f]{32}\.jpg$/);
    const img = await anonimo().get(r.body.coverUrl).buffer(true);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect((await anonimo().get("/api/educacao/capas/ab/0123456789abcdef0123456789abcdef.jpg")).status).toBe(404);
    expect((await anonimo().get("/api/educacao/capas/..%2F..%2Fetc/passwd")).status).toBe(404);
  });

  it("curso: aulas em ordem, aula restrita bloqueada para deslogado, progresso do usuário", async () => {
    const a1 = await criarConteudo(admin, { title: `Aula um ${sufixo}`, listed: false });
    const a2 = await criarConteudo(admin, { title: `Aula dois ${sufixo}`, listed: false, visibility: "REGISTERED" });
    const a3 = await criarConteudo(admin, { title: `Aula três rascunho ${sufixo}`, listed: false });
    await publicar(a1.id);
    await publicar(a2.id);
    const k = await admin.post("/api/admin/educacao/cursos").send({ title: `Como eliminar dívidas ${sufixo}`, summary: "Curso de teste" });
    expect(k.status).toBe(201);
    const aulas = await admin.put(`/api/admin/educacao/cursos/${k.body.id}/aulas`).send({ contentIds: [a2.id, a1.id, a3.id] });
    expect(aulas.body.lessons.map((l: { id: string }) => l.id)).toEqual([a2.id, a1.id, a3.id]);
    // reordena (setas/arrastar mandam a lista inteira na nova ordem)
    await admin.put(`/api/admin/educacao/cursos/${k.body.id}/aulas`).send({ contentIds: [a1.id, a2.id, a3.id] });
    // Curso em rascunho: público não vê
    expect((await anonimo().get(`/api/educacao/cursos/${k.body.slug}`)).status).toBe(404);
    expect((await admin.post(`/api/admin/educacao/cursos/${k.body.id}/publicar`).send({})).status).toBe(200);

    const pub = await anonimo().get(`/api/educacao/cursos/${k.body.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.lessons.map((l: { slug: string }) => l.slug)).toEqual([a1.slug, a2.slug]); // a3 é rascunho
    expect(pub.body.lessons[0].locked).toBe(false);
    expect(pub.body.lessons[1].locked).toBe(true);
    expect(pub.body.completedCount).toBeUndefined();

    const aula = await anonimo().get(`/api/educacao/cursos/${k.body.slug}/aulas/${a2.slug}`);
    expect(aula.body.lesson.locked).toBe(true);
    expect(aula.body.lesson.body).toBeNull();
    expect(aula.body.previous.slug).toBe(a1.slug);
    expect(aula.body.next).toBeNull();

    // Progresso
    expect((await anonimo().post(`/api/educacao/progresso/${a1.id}`).set("Origin", ORIGIN).send({ completed: true })).status).toBe(401);
    expect((await leitor.post(`/api/educacao/progresso/${a3.id}`).send({ completed: true })).status).toBe(404);
    expect((await leitor.post(`/api/educacao/progresso/${a1.id}`).send({ completed: true })).status).toBe(200);
    const meu = await leitor.get(`/api/educacao/cursos/${k.body.slug}`);
    expect(meu.body.completedCount).toBe(1);
    expect(meu.body.lessonsCount).toBe(2);
    expect(meu.body.lessons[0].completed).toBe(true);
    expect(meu.body.lessons[1].locked).toBe(false);
    await leitor.post(`/api/educacao/progresso/${a1.id}`).send({ completed: false });
    expect((await leitor.get(`/api/educacao/cursos/${k.body.slug}`)).body.completedCount).toBe(0);

    // Aula fora da lista, só em curso público: o sitemap leva a aula pública e não a restrita
    const s = await anonimo().get("/api/seo/sitemap.xml");
    expect(s.text).toContain(`/educacao/cursos/${k.body.slug}/${a1.slug}<`);
    expect(s.text).not.toContain(`/educacao/cursos/${k.body.slug}/${a2.slug}<`);
    const head = await anonimo().get(`/api/seo/head?path=/educacao/cursos/${k.body.slug}`);
    expect(head.text).toContain('"@type":"Course"');
  });

  it("aula fora da lista dentro de curso só para cadastrados herda a restrição", async () => {
    const a = await criarConteudo(admin, { title: `Aula de curso restrito ${sufixo}`, listed: false, body: "Conteúdo da aula restrita" });
    await publicar(a.id);
    const k = await admin.post("/api/admin/educacao/cursos").send({ title: `Curso restrito ${sufixo}`, visibility: "REGISTERED" });
    await admin.put(`/api/admin/educacao/cursos/${k.body.id}/aulas`).send({ contentIds: [a.id] });
    await admin.post(`/api/admin/educacao/cursos/${k.body.id}/publicar`).send({});
    const sozinha = await anonimo().get(`/api/educacao/conteudos/${a.slug}`);
    expect(sozinha.body.locked).toBe(true);
    expect(sozinha.body.body).toBeNull();
    expect((await leitor.get(`/api/educacao/conteudos/${a.slug}`)).body.locked).toBe(false);
  });

  it("exemplos (seed) não rodam em produção", async () => {
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await expect(criarExemplosEducacao()).rejects.toThrow(/produção/);
    process.env.NODE_ENV = antes;
    const r = await criarExemplosEducacao();
    expect(r.curso.slug).toBe("como-sair-das-dividas");
  });
});
