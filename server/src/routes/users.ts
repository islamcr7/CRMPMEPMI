import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';

const router = Router();

const publicUser = {
  id: true,
  email: true,
  name: true,
  active: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, scope: true, system: true } },
} as const;

// Liste accessible à tous (pour l'attribution des fiches)
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } });
  res.json(users);
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  roleId: z.string().min(1, 'Rôle requis'),
  password: z.string().min(8, 'Au moins 8 caractères'),
});

router.post('/', requirePerm('admin.users'), async (req, res) => {
  const { password, ...data } = createSchema.parse(req.body);
  const user = await prisma.user.create({
    data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
    select: publicUser,
  });
  res.status(201).json(user);
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  roleId: z.string().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, 'Au moins 8 caractères').optional(),
});

/** Il doit toujours rester au moins un administrateur actif. */
async function assertKeepsAnAdmin(userId: string, next: { roleId?: string; active?: boolean }) {
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  if (!target.role.system) return;
  const losesAdmin = next.active === false || (next.roleId !== undefined && next.roleId !== target.roleId);
  if (!losesAdmin) return;
  const others = await prisma.user.count({ where: { id: { not: userId }, active: true, role: { system: true } } });
  if (others === 0) throw new HttpError(409, 'Il doit rester au moins un administrateur actif');
}

router.patch('/:id', requirePerm('admin.users'), async (req, res) => {
  const id = String(req.params.id);
  const { password, ...data } = updateSchema.parse(req.body);
  if (id === req.user!.id && (data.active === false || (data.roleId && data.roleId !== req.user!.roleId))) {
    throw new HttpError(400, 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
  }
  await assertKeepsAnAdmin(id, data);
  const user = await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: publicUser,
  });
  res.json(user);
});

export default router;
