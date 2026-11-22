import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const publicUser = { id: true, email: true, name: true, role: true, active: true, createdAt: true } as const;

// Liste accessible à tous (pour l'attribution des fiches)
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } });
  res.json(users);
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['ADMIN', 'SALES']).default('SALES'),
  password: z.string().min(8, 'Au moins 8 caractères'),
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { password, ...data } = createSchema.parse(req.body);
  const user = await prisma.user.create({
    data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
    select: publicUser,
  });
  res.status(201).json(user);
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'SALES']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, 'Au moins 8 caractères').optional(),
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const { password, ...data } = updateSchema.parse(req.body);
  if (id === req.user!.id && (data.active === false || data.role === 'SALES')) {
    throw new HttpError(400, 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
  }
  const user = await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: publicUser,
  });
  res.json(user);
});

export default router;
