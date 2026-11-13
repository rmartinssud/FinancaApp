import type { AlertChannel } from "@prisma/client";
import { env } from "../../env.js";
import { sendEmail } from "../../lib/email.js";

// ─────────────────────────────────────────────
// Canais de alerta.
//
// As regras (o que avisar e quando) montam uma MensagemAlerta, que não sabe nada de e-mail.
// Cada canal transforma a mensagem no seu formato e entrega. Hoje só existe o e-mail;
// para ligar o WhatsApp no futuro: novo valor em AlertChannel (schema.prisma), um objeto
// CanalAlerta com id "WHATSAPP" e incluir em CANAIS. Nada nas regras precisa mudar.
// ─────────────────────────────────────────────

export type Destinatario = { userId: string; nome: string; email: string };

export type ItemAlerta = { rotulo: string; valor?: string; detalhe?: string };

export type MensagemAlerta = {
  assunto: string;
  titulo: string;
  // Parágrafos curtos antes da lista
  paragrafos: string[];
  // Grupos de itens (ex.: "Vencem hoje" / "Vencem amanhã"). Um grupo sem título é só uma lista.
  grupos?: { titulo?: string; itens: ItemAlerta[] }[];
  botao: { texto: string; caminho: string }; // caminho dentro do app, ex.: /app/orcamentos/abc
  espaco: string; // nome do espaço (Pessoal, Família...)
};

export interface CanalAlerta {
  id: AlertChannel;
  enviar(destinatario: Destinatario, mensagem: MensagemAlerta): Promise<void>;
}

// Endereço da tela de preferências (rodapé de todo alerta)
export const CAMINHO_PREFERENCIAS = "/app/seguranca#alertas";

export function urlDoApp(caminho: string) {
  return new URL(caminho, env.FRONTEND_URL).toString();
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// E-mail simples: título, texto, lista, botão e rodapé com "Gerenciar alertas". HTML + texto puro.
export function montarEmail(dest: Destinatario, m: MensagemAlerta) {
  const url = urlDoApp(m.botao.caminho);
  const preferencias = urlDoApp(CAMINHO_PREFERENCIAS);
  const primeiroNome = dest.nome.trim().split(/\s+/)[0] || "Olá";

  const textoGrupos = (m.grupos ?? [])
    .map((g) => {
      const linhas = g.itens.map((i) => `- ${i.rotulo}${i.valor ? `: ${i.valor}` : ""}${i.detalhe ? ` (${i.detalhe})` : ""}`);
      return [g.titulo ? `${g.titulo}:` : null, ...linhas].filter(Boolean).join("\n");
    })
    .join("\n\n");
  const text = [
    `Olá, ${primeiroNome}!`,
    "",
    m.titulo,
    "",
    ...m.paragrafos.flatMap((p) => [p, ""]),
    ...(textoGrupos ? [textoGrupos, ""] : []),
    `${m.botao.texto}: ${url}`,
    "",
    "—",
    `Espaço: ${m.espaco}`,
    `Gerenciar alertas por e-mail: ${preferencias}`,
    "Famicash",
  ].join("\n");

  const htmlGrupos = (m.grupos ?? [])
    .map((g) => {
      const linhas = g.itens
        .map(
          (i) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b">
              ${escapar(i.rotulo)}${i.detalhe ? `<br><span style="font-size:12px;color:#64748b">${escapar(i.detalhe)}</span>` : ""}
            </td>
            <td style="padding:8px 0 8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;text-align:right;white-space:nowrap;font-weight:bold">${i.valor ? escapar(i.valor) : ""}</td>
          </tr>`,
        )
        .join("");
      const titulo = g.titulo ? `<p style="margin:20px 0 4px;font-size:13px;font-weight:bold;color:#464fa3;text-transform:uppercase;letter-spacing:.04em">${escapar(g.titulo)}</p>` : "";
      return `${titulo}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${linhas}</table>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f1f5f9">
  <div style="font-family:Roboto,Arial,sans-serif;max-width:520px;margin:auto;padding:24px 16px;color:#1e293b">
    <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#464fa3">Famicash</p>
    <div style="background:#ffffff;border-radius:16px;padding:24px">
      <p style="margin:0 0 8px;font-size:14px;color:#64748b">Olá, ${escapar(primeiroNome)}!</p>
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1e293b">${escapar(m.titulo)}</h1>
      ${m.paragrafos.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#334155">${escapar(p)}</p>`).join("")}
      ${htmlGrupos}
      <p style="margin:24px 0 0"><a href="${escapar(url)}" style="display:inline-block;background:#464fa3;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;font-size:14px">${escapar(m.botao.texto)}</a></p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b">
      Espaço: ${escapar(m.espaco)}<br>
      Você recebe este alerta porque ele está ligado nas suas preferências.
      <a href="${escapar(preferencias)}" style="color:#464fa3">Gerenciar alertas por e-mail</a>
    </p>
  </div>
</body>
</html>`;
  return { text, html };
}

export const canalEmail: CanalAlerta = {
  id: "EMAIL",
  async enviar(dest, m) {
    const { text, html } = montarEmail(dest, m);
    await sendEmail({ to: dest.email, subject: m.assunto, text, html });
  },
};

// Canais ligados (a ordem não importa). WhatsApp entra aqui no futuro.
export const CANAIS: CanalAlerta[] = [canalEmail];
