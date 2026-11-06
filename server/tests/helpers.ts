import request from "supertest";
import type { Express } from "express";
import { outbox } from "../src/lib/email.js";

export const ORIGIN = "http://localhost:5173";

// Cria um email único para cada teste
export const emailUnico = () => `teste-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@exemplo.com`;

export async function cadastrar(app: Express, email: string, senha = "senhaForte123", nome = "Maria Souza") {
  return request(app).post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({ name: nome, email, password: senha });
}

// Pega o link de verificação no "outbox" e abre (como se clicasse no email)
export async function verificarEmail(app: Express, email: string) {
  const msg = [...outbox].reverse().find((m) => m.to === email && m.subject.includes("Confirme"));
  if (!msg) throw new Error("Email de verificação não encontrado");
  const url = new URL(msg.text.match(/https?:\/\/\S+/)![0]);
  return request(app).get(url.pathname + url.search);
}

// Cadastra, verifica e faz login. Devolve um "agent" que guarda o cookie da sessão
export async function usuarioLogado(app: Express, nome = "Maria Souza") {
  const email = emailUnico();
  await cadastrar(app, email, "senhaForte123", nome);
  await verificarEmail(app, email);
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senhaForte123" });
  if (res.status !== 200) throw new Error(`Login falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email };
}
