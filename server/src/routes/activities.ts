import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optDate, optId, optStr, qs } from '../lib/http.js';
import { scope, type AuthUser } from '../middleware/auth.js';

const router = Router();

const TYPES = ['CALL', 'MEETING', 'EMAIL', 'TASK', 'NOTE'] as const;

const include = {
  assignee: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
} as const;

const schema = z.object({
  type: z.enum(TYPES).optional(),
  subject: z.string().trim().min(1, 'Objet requis').max(200),
  description: optStr(5000),
  dueDate: optDate,
  done: z.boolean().optional(),
  companyId: optId,
  contactId: optId,
  dealId: optId,
  assigneeId: optId,
});

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Filtres : status=open|done|all, range=overdue|today|week, assigneeId, companyId, contactId, dealId, q
 */
router.get('/', async (req, res) => {
  const status = qs(req, 'status') ?? 'open';
  const range = qs(req, 'range');
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const q = qs(req, 'q');

  const where: Prisma.ActivityWhereInput = {
    AND: [scope.activity(req.user!)],
    ...(status === 'open' ? { done: false } : status === 'done' ? { done: true } : {}),
    ...(range === 'overdue' ? { dueDate: { lt: today }, done: false } : {}),
    ...(range === 'today' ? { dueDate: { gte: today, lt: tomorrow } } : {}),
    ...(range === 'week' ? { dueDate: { gte: today, lt: nextWeek } } : {}),
    ...(qs(req, 'assigneeId') ? { assigneeId: qs(req, 'assigneeId') } : {}),
    ...(qs(req, 'companyId') ? { companyId: qs(req, 'companyId') } : {}),
    ...(qs(req, 'contactId') ? { contactId: qs(req, 'contactId') } : {}),
    ...(qs(req, 'dealId') ? { dealId: qs(req, 'dealId') } : {}),
    ...(q ? { subject: { contains: q, mode: 'insensitive' } } : {}),
  };
  const items = await prisma.activity.findMany({
    where,
    include,
    orderBy: status === 'done' ? [{ completedAt: 'desc' }] : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 500,
  });
  res.json(items);
});

/** Activité visible (assignée ou créée par l'utilisateur en portée « mes fiches »), sinon 404. */
async function findScoped(id: string, u: AuthUser) {
  const activity = await prisma.activity.findFirst({ where: { id, ...scope.activity(u) } });
  if (!activity) throw notFound('Activité');
  return activity;
}

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const activity = await prisma.activity.create({
    data: {
      ...data,
      // une note est considérée comme terminée dès sa création
      done: data.type === 'NOTE' ? true : data.done ?? false,
      completedAt: data.type === 'NOTE' || data.done ? new Date() : null,
      assigneeId: data.assigneeId === undefined ? req.user!.id : data.assigneeId,
      createdById: req.user!.id,
    },
    include,
  });
  res.status(201).json(activity);
});

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  const current = await findScoped(String(req.params.id), req.user!);
  const activity = await prisma.activity.update({
    where: { id: current.id },
    data: {
      ...data,
      ...(data.done === undefined ? {} : { completedAt: data.done ? new Date() : null }),
    },
    include,
  });
  res.json(activity);
});

router.delete('/:id', async (req, res) => {
  const activity = await findScoped(String(req.params.id), req.user!);
  await prisma.activity.delete({ where: { id: activity.id } });
  res.status(204).end();
});

export default router;
