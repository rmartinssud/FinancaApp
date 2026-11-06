import nodemailer from "nodemailer";
import { env, isProduction } from "../env.js";

type Email = { to: string; subject: string; text: string; html: string };

// Guarda os últimos emails em memória (útil nos testes)
export const outbox: Email[] = [];

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendEmail(email: Email) {
  if (!isProduction) {
    outbox.push(email);
    if (outbox.length > 50) outbox.shift();
  }

  // Sem SMTP configurado: mostra o email no console (modo desenvolvimento)
  if (!transporter) {
    console.log(`\n📧 [email para ${email.to}] ${email.subject}\n${email.text}\n`);
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    ...email,
  });
}

// Modelo simples de email com um botão
export function emailComLink(titulo: string, mensagem: string, textoBotao: string, url: string) {
  const text = `${titulo}\n\n${mensagem}\n\n${textoBotao}: ${url}\n\nSe não foi você, ignore este email.`;
  const html = `
    <div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1e293b">
      <h1 style="color:#464fa3;font-size:22px">${titulo}</h1>
      <p>${mensagem}</p>
      <p><a href="${url}" style="display:inline-block;background:#464fa3;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">${textoBotao}</a></p>
      <p style="font-size:12px;color:#64748b">Se não foi você, ignore este email.</p>
    </div>`;
  return { text, html };
}
