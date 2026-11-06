import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Valida req.query com um schema zod. O resultado fica em res.locals.query
export function validateQuery(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: "Dados inválidos.", detalhes: z.flattenError(result.error).fieldErrors });
    }
    res.locals.query = result.data;
    next();
  };
}

// Valida req.body com um schema zod
export function validateBody(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Dados inválidos.", detalhes: z.flattenError(result.error).fieldErrors });
    }
    req.body = result.data;
    next();
  };
}
