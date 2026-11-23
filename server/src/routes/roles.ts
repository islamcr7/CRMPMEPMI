import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound, optStr } from '../lib/http.js';
import { can, FORBIDDEN, requirePerm } from '../middleware/auth.js';
import { ACTION_LABELS, ADMIN_LOCKED, ALL_PERMISSIONS, MODULES, sanitizePermissions } from '../lib/permissions.js';

const router = Router();

/** Catalogue des droits, pour construire la grille dans l'interface. */
router.get('/catalog', (_req, res) => {
  res.json({
    modules: MODULES.map((m) => ({ key: m.key, label: m.label, actions: m.actions.map((a) => ({ key: `${m.key}.${a}`, label: ACTION_LABELS[a] })) })),
    locked: ADMIN_LOCKED,
  });
});

// Liste : pour la page des rôles et pour choisir le rôle d'un utilisateur
router.get('/', async (req, res) => {
  if (!can(req.user, 'admin.users') && !can(req.user, 'admin.roles')) throw new HttpError(403, FORBIDDEN);
  const roles = await prisma.appRole.findMany({ orderBy: [{ system: 'desc' }, { name: 'asc' }], include: { _count: { select: { users: true } } } });
  res.json(roles);
});

const schema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(60),
  description: optStr(300),
  scope: z.enum(['OWN', 'ALL']),
  permissions: z.array(z.string()).max(ALL_PERMISSIONS.length * 2),
});

router.post('/', requirePerm('admin.roles'), async (req, res) => {
  const data = schema.parse(req.body);
  const role = await prisma.appRole.create({ data: { ...data, permissions: sanitizePermissions(data.permissions) } });
  res.status(201).json(role);
});

router.patch('/:id', requirePerm('admin.roles'), async (req, res) => {
  const data = schema.partial().parse(req.body);
  const current = await prisma.appRole.findUnique({ where: { id: String(req.params.id) } });
  if (!current) throw notFound('Rôle');
  let permissions = data.permissions ? sanitizePermissions(data.permissions) : undefined;
  if (current.system) {
    // Rôle Administrateur : toujours toutes les données, droits d'administration verrouillés
    if (data.scope && data.scope !== 'ALL') throw new HttpError(400, 'Le rôle Administrateur voit toujours toutes les fiches');
    if (permissions) permissions = [...new Set([...permissions, ...ADMIN_LOCKED])];
  }
  const role = await prisma.appRole.update({ where: { id: current.id }, data: { ...data, ...(permissions ? { permissions } : {}) } });
  res.json(role);
});

router.delete('/:id', requirePerm('admin.roles'), async (req, res) => {
  const role = await prisma.appRole.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound('Rôle');
  if (role.system) throw new HttpError(409, 'Le rôle Administrateur ne peut pas être supprimé');
  if (role._count.users > 0) throw new HttpError(409, 'Ce rôle est attribué à des utilisateurs : changez d’abord leur rôle');
  await prisma.appRole.delete({ where: { id: role.id } });
  res.status(204).end();
});

export default router;
