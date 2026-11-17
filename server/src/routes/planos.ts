import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { withHousehold } from "../middleware/household.js";
import { validateBody } from "../middleware/validate.js";
import { papelDoUsuario } from "../services/educacao/papeis.js";
import { CupomRecusado, MESES_CUPOM_MAX, normalizarCodigo, resgatarCupom, usoDoEspaco } from "../services/planos.js";

// ─────────────────────────────────────────────
// /api/plano: plano do espaço ativo, uso e resgate de cupom (só o dono resgata)
// /api/admin/cupons: cupons (só ADMIN da plataforma)
// Pagamento (Asaas) fica para depois.
// ─────────────────────────────────────────────

export const planoRouter = Router();
planoRouter.use(requireAuth, withHousehold);

planoRouter.get("/", async (req, res) => {
  const h = req.household!;
  res.json({ household: { id: h.id, name: h.name, role: h.role }, canManage: h.role === "OWNER", ...(await usoDoEspaco(h.id)) });
});

const resgate = z.object({ code: z.string().trim().min(3, "Digite o código do cupom.").max(40, "Código longo demais.") });

planoRouter.post("/cupom", validateBody(resgate), async (req, res) => {
  const h = req.household!;
  if (h.role !== "OWNER") return res.status(403).json({ error: "Só o dono do espaço pode usar um cupom." });
  try {
    const r = await resgatarCupom(h.id, req.user!.id, (req.body as z.infer<typeof resgate>).code);
    res.json({ ok: true, redeemed: { plan: r.plan.nome, endsAt: r.endsAt.toISOString(), months: r.months }, ...(await usoDoEspaco(h.id)) });
  } catch (e) {
    if (e instanceof CupomRecusado) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// ── Admin ─────────────────────────────────────

export const adminCuponsRouter = Router();

async function soAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if ((await papelDoUsuario(req.user!.id)) !== "ADMIN") return res.status(403).json({ error: "Só um administrador pode fazer isso." });
    next();
  } catch (e) {
    next(e);
  }
}
adminCuponsRouter.use(requireAuth, soAdmin);

const CODIGO = /^[A-Z0-9_-]{3,40}$/;
const codigoAleatorio = () => `FAMI-${randomBytes(4).toString("hex").toUpperCase()}`;

const campos = {
  plan: z.enum(["FAMILIA", "FAMILIA_PLUS"], { error: "Escolha Família ou Família+." }),
  months: z.number({ error: "Use de 1 a 12 meses." }).int().min(1, "Use de 1 a 12 meses.").max(MESES_CUPOM_MAX, "Use de 1 a 12 meses."),
  maxUses: z.number().int().min(1, "Use 1 ou mais (ou deixe vazio para sem limite).").nullable().optional(),
  expiresAt: z.coerce.date({ error: "Data inválida." }).nullable().optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(200).nullable().optional(),
};
const novoCupom = z.object({
  code: z
    .string()
    .transform(normalizarCodigo)
    .refine((c) => c === "" || CODIGO.test(c), "Use de 3 a 40 letras, números, - ou _.")
    .nullable()
    .optional(),
  ...campos,
});
const edicaoCupom = z.object(campos).partial();

const serializar = (v: Awaited<ReturnType<typeof listar>>[number]) => ({
  id: v.id,
  code: v.code,
  plan: v.plan,
  months: v.months,
  maxUses: v.maxUses,
  expiresAt: v.expiresAt?.toISOString() ?? null,
  active: v.active,
  note: v.note,
  createdAt: v.createdAt.toISOString(),
  uses: v.redemptions.length,
  redemptions: v.redemptions.map((r) => ({
    householdName: r.household.name,
    userName: r.user?.name ?? null,
    userEmail: r.user?.email ?? null,
    createdAt: r.createdAt.toISOString(),
    planEndsAt: r.planEndsAt.toISOString(),
  })),
});

async function listar(where: { id?: string } = {}) {
  const lista = await prisma.voucher.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { redemptions: { orderBy: { createdAt: "desc" }, include: { household: { select: { name: true } } } } },
  });
  // Quem resgatou (sem relação no schema para não mexer na tabela de usuários)
  const ids = [...new Set(lista.flatMap((v) => v.redemptions.map((r) => r.userId)))];
  const usuarios = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
  return lista.map((v) => ({ ...v, redemptions: v.redemptions.map((r) => ({ ...r, user: usuarios.get(r.userId) ?? null })) }));
}

adminCuponsRouter.get("/", async (_req, res) => {
  res.json((await listar()).map(serializar));
});

adminCuponsRouter.post("/", validateBody(novoCupom), async (req, res) => {
  const d = req.body as z.infer<typeof novoCupom>;
  const code = d.code || codigoAleatorio();
  if (await prisma.voucher.findUnique({ where: { code } })) return res.status(409).json({ error: "Já existe um cupom com esse código.", detalhes: { code: ["Já existe um cupom com esse código."] } });
  const v = await prisma.voucher.create({
    data: { code, plan: d.plan, months: d.months, maxUses: d.maxUses ?? null, expiresAt: d.expiresAt ?? null, active: d.active ?? true, note: d.note || null, createdById: req.user!.id },
  });
  res.status(201).json(serializar((await listar({ id: v.id }))[0]));
});

adminCuponsRouter.patch("/:id", validateBody(edicaoCupom), async (req, res) => {
  const id = String(req.params.id);
  if (!(await prisma.voucher.findUnique({ where: { id } }))) return res.status(404).json({ error: "Cupom não encontrado." });
  const d = req.body as z.infer<typeof edicaoCupom>;
  await prisma.voucher.update({ where: { id }, data: { ...d, note: d.note === undefined ? undefined : d.note || null } });
  res.json(serializar((await listar({ id }))[0]));
});
