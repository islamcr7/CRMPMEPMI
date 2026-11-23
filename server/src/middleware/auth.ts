import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  /** OWN : ne voit que ses fiches ; ALL : toutes les fiches */
  scope: 'OWN' | 'ALL';
  permissions: string[];
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

export const toAuthUser = (u: { id: string; email: string; name: string; role: { id: string; name: string; scope: 'OWN' | 'ALL'; permissions: string[] } }): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  roleId: u.role.id,
  roleName: u.role.name,
  scope: u.role.scope,
  permissions: u.role.permissions,
});

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    // Rôle relu à chaque requête : un changement de droits s'applique immédiatement
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Session invalide' });
      return;
    }
    req.user = toAuthUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée' });
  }
}

/* ---------------- Droits ---------------- */

export const can = (user: AuthUser | undefined, perm: string) => !!user?.permissions.includes(perm);

export const FORBIDDEN = 'Vous n’avez pas le droit d’effectuer cette action';

export function assertPerm(user: AuthUser, ...perms: string[]) {
  if (!perms.every((p) => can(user, p))) throw new HttpError(403, FORBIDDEN);
}

/** Middleware : exige tous les droits indiqués. */
export function requirePerm(...perms: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !perms.every((p) => can(req.user, p))) {
      next(new HttpError(403, FORBIDDEN));
      return;
    }
    next();
  };
}

/** Middleware : selon la méthode HTTP (GET → view, POST → create, PATCH/PUT → edit, DELETE → delete). */
export function requireCrud(module: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const action = req.method === 'GET' ? 'view' : req.method === 'POST' ? 'create' : req.method === 'DELETE' ? 'delete' : 'edit';
    if (!can(req.user, `${module}.${action}`)) {
      next(new HttpError(403, FORBIDDEN));
      return;
    }
    next();
  };
}

/* ---------------- Portée (visibilité des fiches) ---------------- */

const own = (u: AuthUser) => u.scope === 'OWN';

/** Filtres Prisma limitant les fiches visibles selon la portée du rôle. */
export const scope = {
  company: (u: AuthUser): Prisma.CompanyWhereInput => (own(u) ? { ownerId: u.id } : {}),
  contact: (u: AuthUser): Prisma.ContactWhereInput => (own(u) ? { ownerId: u.id } : {}),
  deal: (u: AuthUser): Prisma.DealWhereInput => (own(u) ? { ownerId: u.id } : {}),
  activity: (u: AuthUser): Prisma.ActivityWhereInput => (own(u) ? { OR: [{ assigneeId: u.id }, { createdById: u.id }] } : {}),
  // Devis / factures qu'il a créés, ou adressés à une entreprise dont il est responsable
  document: (u: AuthUser): Prisma.DocumentWhereInput => (own(u) ? { OR: [{ ownerId: u.id }, { company: { ownerId: u.id } }] } : {}),
};

/** Une fiche est accessible si la portée est « toutes » ou si l'utilisateur en est responsable. */
export function inScope(u: AuthUser, ...ownerIds: (string | null | undefined)[]) {
  return !own(u) || ownerIds.some((id) => id === u.id);
}

/** 404 (et non 403) pour une fiche hors portée : on ne révèle pas son existence. */
export function assertInScope(u: AuthUser, what: string, ...ownerIds: (string | null | undefined)[]) {
  if (!inScope(u, ...ownerIds)) throw new HttpError(404, `${what} introuvable`);
}

/** En portée « mes fiches », un utilisateur ne peut attribuer une fiche qu'à lui-même. */
export function assertAssignable(u: AuthUser, ownerId: string | null | undefined) {
  if (own(u) && ownerId !== undefined && ownerId !== u.id) {
    throw new HttpError(403, 'Vous ne pouvez attribuer une fiche qu’à vous-même');
  }
}
