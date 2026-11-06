import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { cadastrar, verificarEmail, emailUnico, usuarioLogado, ORIGIN } from "./helpers.js";

const app = createApp();

describe("cadastro", () => {
  it("cria o usuário com família, Carteira e categorias padrão", async () => {
    const email = emailUnico();
    const res = await cadastrar(app, email, "senhaForte123", "João Pereira");
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: { include: { household: { include: { accounts: true, categories: true } } } } },
    });
    expect(user.emailVerified).toBe(false);
    expect(user.memberships).toHaveLength(1);

    const { role, household } = user.memberships[0];
    expect(role).toBe("OWNER");
    expect(household.name).toBe("Família João");
    expect(household.accounts.map((a) => a.name)).toEqual(["Carteira"]);
    expect(household.accounts[0].initialBalance.toFixed(2)).toBe("0.00");
    expect(household.categories).toHaveLength(10);
    expect(household.categories.map((c) => c.name)).toContain("Mercado");
  });

  it("recusa senha com menos de 8 caracteres", async () => {
    const res = await cadastrar(app, emailUnico(), "1234567");
    expect(res.status).toBe(400);
  });

  it("não cria um segundo usuário com o mesmo email", async () => {
    const email = emailUnico();
    await cadastrar(app, email);
    await cadastrar(app, email);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe("login", () => {
  it("bloqueia login antes de confirmar o email", async () => {
    const email = emailUnico();
    await cadastrar(app, email);
    const res = await request(app).post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senhaForte123" });
    expect(res.status).toBe(403);
  });

  it("entra depois de confirmar o email e recebe cookie httpOnly", async () => {
    const email = emailUnico();
    await cadastrar(app, email);
    const verif = await verificarEmail(app, email);
    expect(verif.status).toBe(302);

    const res = await request(app).post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senhaForte123" });
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const sessao = cookies.find((c) => c.includes("session_token"));
    expect(sessao).toBeDefined();
    expect(sessao).toMatch(/HttpOnly/i);
    expect(sessao).toMatch(/SameSite=Lax/i);
  });

  it("recusa senha errada", async () => {
    const email = emailUnico();
    await cadastrar(app, email);
    await verificarEmail(app, email);
    const res = await request(app).post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senhaErrada99" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/me", () => {
  it("retorna 401 sem login", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf("string");
  });

  it("retorna o usuário e a família com login", async () => {
    const { agent, email } = await usuarioLogado(app, "Ana Lima");
    const res = await agent.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.household.name).toBe("Família Ana");
    expect(res.body.household.role).toBe("OWNER");
  });
});

describe("dois fatores (TOTP)", () => {
  it("ativa o 2FA e passa a pedir o código no login", async () => {
    const { generateSync } = await import("otplib");
    const { agent, email } = await usuarioLogado(app, "Fábio Nunes");

    const ativar = await agent.post("/api/auth/two-factor/enable").set("Origin", ORIGIN).send({ password: "senhaForte123" });
    expect(ativar.status).toBe(200);
    expect(ativar.body.backupCodes).toHaveLength(10);
    const secret = new URL(ativar.body.totpURI).searchParams.get("secret")!;

    const confirmar = await agent.post("/api/auth/two-factor/verify-totp").set("Origin", ORIGIN).send({ code: generateSync({ secret }) });
    expect(confirmar.status).toBe(200);

    // Novo login: agora pede o segundo fator
    const novo = request.agent(app);
    const login = await novo.post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senhaForte123" });
    expect(login.body.twoFactorRedirect).toBe(true);
    expect((await novo.get("/api/me")).status).toBe(401);

    const codigo = await novo.post("/api/auth/two-factor/verify-totp").set("Origin", ORIGIN).send({ code: generateSync({ secret }) });
    expect(codigo.status).toBe(200);
    expect((await novo.get("/api/me")).body.user.twoFactorEnabled).toBe(true);
  });
});
