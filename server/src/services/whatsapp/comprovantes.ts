import type { WhatsAppReceipt } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { gravarAnexo, tipoDoArquivo } from "../anexos.js";
import { AnexoRecusado } from "../otimizarAnexo.js";
import { normalizar } from "./parser.js";

// ─────────────────────────────────────────────
// Comprovante (foto ou PDF) mandado pelo WhatsApp → anexo do lançamento, se a pessoa quiser.
//
// 1. Chegou foto/documento: guardamos o arquivo (whatsapp_receipts) e ligamos ao rascunho que ele gerou.
// 2. A pessoa toca em Confirmar: o lançamento é criado e perguntamos "Anexar comprovante" / "Não anexar".
// 3. Anexar: grava pelo mesmo caminho do app (services/anexos.ts: 10 por lançamento, 3 MB, HEIC → JPEG,
//    PDF comprimido). Se não der, o lançamento continua salvo, sem o anexo.
// O arquivo guardado some ao anexar, ao responder "Não anexar", com o rascunho cancelado ou em 1 dia.
// ─────────────────────────────────────────────

// Resposta por texto ("sim", "anexa", "não") vale por 30 minutos depois da pergunta; o botão vale até a limpeza (1 dia)
export const VALIDADE_PERGUNTA_MIN = 30;
const UMA_HORA_MS = 60 * 60 * 1000;
const UM_DIA_MS = 24 * UMA_HORA_MS;

// Tipos aceitos como comprovante (o WhatsApp manda o mime declarado; conferimos os bytes ao anexar)
const MIMES_COMPROVANTE = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ehMimeDeComprovante = (mime: string) => MIMES_COMPROVANTE.includes(mime.toLowerCase());

// Nome do arquivo: o do documento (se veio) ou "comprovante-AAAA-MM-DD.ext"
export function nomeDoComprovante(dados: Buffer, nome: string | undefined, hoje: string) {
  const ext = tipoDoArquivo(dados)?.ext ?? "bin";
  const limpo = (nome ?? "").trim();
  return limpo || `comprovante-whatsapp-${hoje}.${ext}`;
}

// Guarda o arquivo enquanto o bot monta o rascunho. Devolve o id, ou null se não for foto/PDF que dá para anexar.
export async function guardarComprovante(dono: { userId: string; waId: string }, dados: Buffer, nome: string) {
  const tipo = tipoDoArquivo(dados);
  if (!tipo) return null;
  const r = await prisma.whatsAppReceipt.create({ data: { userId: dono.userId, waId: dono.waId, data: new Uint8Array(dados), mime: tipo.mime, fileName: nome } });
  return r.id;
}

// Liga o comprovante ao rascunho criado (ou corrigido) a partir dele. Um comprovante por rascunho.
export async function ligarComprovante(comprovanteId: string | undefined, draftId: string) {
  if (!comprovanteId) return;
  await prisma.$transaction([
    prisma.whatsAppReceipt.deleteMany({ where: { draftId, id: { not: comprovanteId } } }),
    prisma.whatsAppReceipt.updateMany({ where: { id: comprovanteId }, data: { draftId } }),
  ]);
}

// O rascunho não saiu (sem valor, erro, só conversa): o arquivo não fica guardado
export async function descartarSeSolto(comprovanteId: string) {
  await prisma.whatsAppReceipt.deleteMany({ where: { id: comprovanteId, draftId: null } });
}

export async function descartarDoRascunho(draftId: string) {
  await prisma.whatsAppReceipt.deleteMany({ where: { draftId } });
}

// Depois do Confirmar: há comprovante para oferecer? Marca a pergunta.
export async function perguntarSeAnexa(draftId: string) {
  const r = await prisma.whatsAppReceipt.updateMany({ where: { draftId }, data: { askedAt: new Date() } });
  return r.count > 0;
}

// A pergunta mais recente ainda sem resposta (para "sim"/"anexa"/"não" por texto)
export function perguntaEmAberto(waId: string, userId: string) {
  return prisma.whatsAppReceipt.findFirst({
    where: { waId, userId, askedAt: { gt: new Date(Date.now() - VALIDADE_PERGUNTA_MIN * 60 * 1000) }, draft: { is: { status: "CONFIRMED" } } },
    orderBy: { askedAt: "desc" },
    select: { id: true, draftId: true },
  });
}

// Respostas por texto à pergunta "Anexar comprovante?"
const ANEXAR = new Set(["anexa", "anexar", "anexe", "anexo", "pode anexar", "anexa sim", "sim anexa", "sim anexar", "sim pode anexar", "anexar comprovante", "anexa o comprovante", "quero anexar", "salva o comprovante", "guarda o comprovante", "📎"]);
const NAO_ANEXAR = new Set(["nao", "n", "nao anexar", "nao anexa", "nao precisa", "nao quero", "nao obrigado", "nao obrigada", "dispensa", "deixa", "deixa pra la", "sem anexo", "👎"]);
// "explicito": fala de anexo (vale mesmo com outro rascunho pendente); "sim": o "sim" genérico (só sem rascunho pendente)
export function respostaDeAnexo(texto: string, ehSim: boolean): "anexar" | "nao" | "sim" | null {
  const t = normalizar(texto).replace(/[!.,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (ANEXAR.has(t)) return "anexar";
  if (NAO_ANEXAR.has(t)) return "nao";
  return ehSim ? "sim" : null;
}

export type ResultadoAnexo =
  | { ok: true; parcelado: boolean; cartao: boolean }
  | { ok: false; motivo: "resolvido" | "somente-leitura" | "fora-do-espaco" | "sem-lancamento" | "recusado" | "erro"; mensagem?: string };

// Grava o comprovante como anexo do lançamento criado pelo rascunho. O arquivo guardado é apagado em qualquer caso.
export async function anexarComprovante(dono: { userId: string; waId: string }, draftId: string): Promise<ResultadoAnexo> {
  const comprovante: (WhatsAppReceipt & { draft: { status: string; householdId: string; transactionId: string | null; installments: number } | null }) | null =
    await prisma.whatsAppReceipt.findFirst({
      where: { draftId, userId: dono.userId, waId: dono.waId },
      include: { draft: { select: { status: true, householdId: true, transactionId: true, installments: true } } },
    });
  if (!comprovante?.draft || comprovante.draft.status !== "CONFIRMED" || !comprovante.draft.transactionId) return { ok: false, motivo: "resolvido" };
  // Trava: um toque só (dois toques no botão não anexam duas vezes)
  const pego = await prisma.whatsAppReceipt.deleteMany({ where: { id: comprovante.id } });
  if (!pego.count) return { ok: false, motivo: "resolvido" };

  const { householdId, transactionId, installments } = comprovante.draft;
  // Papel no espaço do lançamento AGORA (pode ter mudado desde o Confirmar)
  const membro = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId: dono.userId } } });
  if (!membro) return { ok: false, motivo: "fora-do-espaco" };
  if (membro.role === "VIEWER") return { ok: false, motivo: "somente-leitura" };
  const lancamento = await prisma.transaction.findFirst({ where: { id: transactionId, householdId }, select: { id: true, account: { select: { type: true } } } });
  if (!lancamento) return { ok: false, motivo: "sem-lancamento" };

  try {
    await gravarAnexo(lancamento.id, Buffer.from(comprovante.data), comprovante.fileName);
  } catch (e) {
    if (e instanceof AnexoRecusado) return { ok: false, motivo: "recusado", mensagem: e.message };
    console.error("WhatsApp: falha ao anexar comprovante", e);
    return { ok: false, motivo: "erro" };
  }
  return { ok: true, parcelado: installments > 1, cartao: lancamento.account.type === "CREDIT_CARD" };
}

// Limpeza (junto com limparWhatsApp): nada fica guardado mais de 1 dia
export function limparComprovantes(agora = new Date()) {
  return prisma.whatsAppReceipt.deleteMany({
    where: {
      OR: [
        { createdAt: { lt: new Date(agora.getTime() - UM_DIA_MS) } },
        // Rascunho cancelado (botão, "cancelar", substituído por outro) ou vencido
        { draft: { is: { status: "CANCELED" } } },
        // Ficou solto (o bot caiu no meio)
        { draftId: null, createdAt: { lt: new Date(agora.getTime() - UMA_HORA_MS) } },
      ],
    },
  });
}
