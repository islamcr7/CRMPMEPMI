import type { ErrorRequestHandler, Request } from 'express';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Données invalides',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Cette valeur existe déjà' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: 'Impossible : cet élément est référencé ailleurs (ex. factures)' });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
};

/* ---------- Helpers de validation ---------- */

/** Chaîne optionnelle : "" devient null, undefined reste undefined (non modifié). */
export const optStr = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === '' ? null : v));

export const optId = z
  .string()
  .nullish()
  .transform((v) => (v === '' ? null : v));

/** Date optionnelle au format ISO ou YYYY-MM-DD. */
export const optDate = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide' });
      return z.NEVER;
    }
    return d;
  });

export function pagination(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export const qs = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
