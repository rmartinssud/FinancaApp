import express, { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold, scope, bloqueiaSomenteLeitura } from "../middleware/household.js";
import { armazenamento, apagarArquivos } from "../services/armazenamento.js";
import { AnexoRecusado, LIMITE_ANEXO, LIMITE_ENVIO } from "../services/otimizarAnexo.js";
import { MAX_ANEXOS, gravarAnexo, tipoDoArquivo } from "../services/anexos.js";

// ─────────────────────────────────────────────
// Anexos de lançamento: foto (JPG, PNG, WEBP, HEIC) ou PDF, até 3 MB GRAVADOS cada.
// Recebemos até 15 MB: foto ou PDF acima de 3 MB é reduzido antes de gravar (services/otimizarAnexo.ts);
// se não couber em 3 MB, recusamos. O navegador já manda as fotos reduzidas na maioria dos casos.
// Upload: POST /api/transactions/:id/attachments com o arquivo no corpo (cru),
// o tipo em Content-Type e o nome em X-File-Name (encodeURIComponent).
// Download só para quem está no espaço do lançamento.
// ─────────────────────────────────────────────

// Tipos que qualquer navegador mostra na tela (o resto, como HEIC, vai como download)
const ABRE_NA_TELA = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export { LIMITE_ANEXO, LIMITE_ENVIO };
export { MAX_ANEXOS, tipoDoArquivo };

const lerCorpo = express.raw({ type: () => true, limit: LIMITE_ENVIO });
const MSG_ENVIO_GRANDE = "Arquivo grande demais. Envie arquivos de até 15 MB (fotos e PDFs acima de 3 MB são reduzidos automaticamente).";

// Corpo cru com limite de 15 MB e mensagem clara (413) em vez do erro genérico
function corpoDoArquivo(req: Request, res: Response, next: NextFunction) {
  const tamanho = Number(req.header("content-length") ?? 0);
  if (tamanho > LIMITE_ENVIO) return res.status(413).json({ error: MSG_ENVIO_GRANDE });
  lerCorpo(req, res, (err?: unknown) => {
    if (err) {
      const status = (err as { status?: number }).status;
      if (status === 413) return res.status(413).json({ error: MSG_ENVIO_GRANDE });
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

// Nome mandado pelo app (X-File-Name, encodeURIComponent)
function nomeOriginal(req: Request) {
  let nome = req.header("x-file-name") ?? "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    // nome mal codificado: usa o padrão
  }
  return nome;
}

// Upload (montado no router de lançamentos: /api/transactions/:id/attachments)
export const uploadRouter = Router({ mergeParams: true });
uploadRouter.use(requireAuth, withHousehold, bloqueiaSomenteLeitura);

uploadRouter.post("/", corpoDoArquivo, async (req, res) => {
  const lancamento = await prisma.transaction.findFirst({ where: { id: String(req.params.id), ...scope(req) }, select: { id: true } });
  if (!lancamento) return res.status(404).json({ error: "Lançamento não encontrado." });

  const dados = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!dados.length) return res.status(400).json({ error: "Envie um arquivo." });
  if (dados.length > LIMITE_ENVIO) return res.status(413).json({ error: MSG_ENVIO_GRANDE });
  // Tipo, limite de 10 por lançamento, otimização acima de 3 MB: services/anexos.ts (o WhatsApp usa o mesmo)
  try {
    const { anexo } = await gravarAnexo(lancamento.id, dados, nomeOriginal(req));
    res.status(201).json(serializarAnexo(anexo));
  } catch (e) {
    if (e instanceof AnexoRecusado) return res.status(e.status).json({ error: e.message });
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
  // HEIC (e qualquer tipo que o navegador não mostra) sempre baixa: abrir na tela daria imagem quebrada
  const baixar = req.query.download === "1" || !ABRE_NA_TELA.includes(anexo.mime);
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
