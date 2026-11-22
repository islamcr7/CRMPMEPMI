import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const AUTH_COOKIE = 'crm_token';

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.tokenTtlDays}d` });
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
  maxAge: config.tokenTtlDays * 24 * 60 * 60 * 1000,
  path: '/',
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Session invalide' });
      return;
    }
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'Accès réservé aux administrateurs'));
      return;
    }
    next();
  };
}

/** Suppression autorisée pour un admin ou le propriétaire de la fiche. */
export function assertCanDelete(user: AuthUser, ownerId: string | null | undefined) {
  if (user.role === 'ADMIN') return;
  if (ownerId && ownerId === user.id) return;
  throw new HttpError(403, 'Seul le responsable de la fiche ou un administrateur peut la supprimer');
}
