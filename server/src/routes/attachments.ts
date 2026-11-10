import express, { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { armazenamento, apagarArquivos } from "../services/armazenamento.js";

// ─────────────────────────────────────────────
// Anexos de lançamento: foto (JPG, PNG, WEBP, HEIC) ou PDF, até 3 MB cada.
// Upload: POST /api/transactions/:id/attachments com o arquivo no corpo (cru),
// o tipo em Content-Type e o nome em X-File-Name (encodeURIComponent).
// Download só para quem está no espaço do lançamento.
// ─────────────────────────────────────────────

export const LIMITE_ANEXO = 3 * 1024 * 1024;
export const MAX_ANEXOS = 10;

// Descobre o tipo pelos primeiros bytes (não confia só no Content-Type)
export function tipoDoArquivo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp") {
    const marca = b.toString("latin1", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(marca)) return { mime: "image/heic", ext: "heic" };
  }
  return null;
}

const lerCorpo = express.raw({ type: () => true, limit: LIMITE_ANEXO });

// Corpo cru com limite de 3 MB e mensagem clara (413) em vez do erro genérico
function corpoDoArquivo(req: Request, res: Response, next: NextFunction) {
  const tamanho = Number(req.header("content-length") ?? 0);
  if (tamanho > LIMITE_ANEXO) return res.status(413).json({ error: "Arquivo grande demais. O limite é 3 MB por arquivo." });
  lerCorpo(req, res, (err?: unknown) => {
    if (err) {
      const status = (err as { status?: number }).status;
      if (status === 413) return res.status(413).json({ error: "Arquivo grande demais. O limite é 3 MB por arquivo." });
      return res.status(400).json({ error: "Não foi possível ler o arquivo enviado." });
    }
    next();
  });
}

export const serializarAnexo = (a: { id: string; originalName: string; mime: string; size: number; createdAt: Date }) => ({
  id: a.id,
  originalName: a.originalName,
  mime: a.mime,
  size: a.size,
  createdAt: a.createdAt.toISOString(),
});

function nomeOriginal(req: Request, ext: string) {
  let nome = req.header("x-file-name") ?? "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    // nome mal codificado: usa o padrão
  }
  // eslint-disable-next-line no-control-regex
  nome = nome.replace(/[\u0000-\u001f\\/"]/g, "").trim().slice(0, 120);
  return nome || `anexo.${ext}`;
}

// Upload (montado no router de lançamentos: /api/transactions/:id/attachments)
export const uploadRouter = Router({ mergeParams: true });
uploadRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

uploadRouter.post("/", corpoDoArquivo, async (req, res) => {
  const lancamento = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) }, select: { id: true } });
  if (!lancamento) return res.status(404).json({ error: "Lançamento não encontrado." });

  const dados = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!dados.length) return res.status(400).json({ error: "Envie um arquivo." });
  if (dados.length > LIMITE_ANEXO) return res.status(413).json({ error: "Arquivo grande demais. O limite é 3 MB por arquivo." });
  const tipo = tipoDoArquivo(dados);
  if (!tipo) return res.status(400).json({ error: "Tipo de arquivo não aceito. Envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF." });

  const quantos = await prisma.transactionAttachment.count({ where: { transactionId: lancamento.id } });
  if (quantos >= MAX_ANEXOS) return res.status(400).json({ error: `Cada lançamento aceita até ${MAX_ANEXOS} anexos.` });

  const chave = await armazenamento().salvar(dados, tipo.ext);
  try {
    const anexo = await prisma.transactionAttachment.create({
      data: { transactionId: lancamento.id, originalName: nomeOriginal(req, tipo.ext), mime: tipo.mime, size: dados.length, storageKey: chave },
    });
    res.status(201).json(serializarAnexo(anexo));
  } catch (e) {
    await apagarArquivos([chave]);
    throw e;
  }
});

// /api/attachments/:id → baixar (GET) e apagar (DELETE)
export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

const doEspaco = (req: Request) =>
  prisma.transactionAttachment.findFirst({ where: { id: String(req.params.id), transaction: scope(req) } });

attachmentsRouter.get("/:id", async (req, res) => {
  const anexo = await doEspaco(req);
  if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });
  let dados: Buffer;
  try {
    dados = await armazenamento().ler(anexo.storageKey);
  } catch {
    return res.status(404).json({ error: "O arquivo deste anexo não foi encontrado no servidor." });
  }
  const baixar = req.query.download === "1";
  res.setHeader("Content-Type", anexo.mime);
  res.setHeader("Content-Length", String(dados.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `${baixar ? "attachment" : "inline"}; filename="anexo"; filename*=UTF-8''${encodeURIComponent(anexo.originalName)}`,
  );
  res.end(dados);
});

attachmentsRouter.delete("/:id", async (req, res) => {
  const anexo = await doEspaco(req);
  if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });
  await prisma.transactionAttachment.delete({ where: { id: anexo.id } });
  await apagarArquivos([anexo.storageKey]);
  res.status(204).end();
});
