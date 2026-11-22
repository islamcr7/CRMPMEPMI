import { Router } from 'express';
import { z } from 'zod';
import type { DealStage, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optDate, optId, optStr, qs } from '../lib/http.js';
import { assertCanDelete } from '../middleware/auth.js';

const router = Router();

const STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
const DEFAULT_PROBABILITY: Record<DealStage, number> = {
  NEW: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

const include = {
  owner: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
} as const;

const schema = z.object({
  title: z.string().trim().min(1, 'Titre requis').max(200),
  amount: z.coerce.number().min(0).max(1e12).optional(),
  stage: z.enum(STAGES).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: optDate,
  notes: optStr(5000),
  companyId: optId,
  contactId: optId,
  ownerId: optId,
});

router.get('/', async (req, res) => {
  const q = qs(req, 'q');
  const ownerId = qs(req, 'ownerId');
  const stage = qs(req, 'stage');
  const where: Prisma.DealWhereInput = {
    ...(ownerId ? { ownerId } : {}),
    ...(stage && (STAGES as readonly string[]).includes(stage) ? { stage: stage as DealStage } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { company: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const deals = await prisma.deal.findMany({ where, include, orderBy: { updatedAt: 'desc' }, take: 1000 });
  res.json(deals);
});

router.get('/:id', async (req, res) => {
  const deal = await prisma.deal.findUnique({
    where: { id: req.params.id },
    include: {
      ...include,
      activities: { orderBy: [{ done: 'asc' }, { dueDate: 'asc' }], include: { assignee: include.owner } },
      documents: { orderBy: { issueDate: 'desc' } },
    },
  });
  if (!deal) throw notFound('Opportunité');
  res.json(deal);
});

/** Ajuste probabilité et date de clôture quand l'étape change. */
function stageSideEffects(stage: DealStage | undefined, probability: number | undefined) {
  if (!stage) return {};
  return {
    probability: stage === 'WON' || stage === 'LOST' ? DEFAULT_PROBABILITY[stage] : probability ?? DEFAULT_PROBABILITY[stage],
    closedAt: stage === 'WON' || stage === 'LOST' ? new Date() : null,
  };
}

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const stage = data.stage ?? 'NEW';
  const deal = await prisma.deal.create({
    data: {
      ...data,
      stage,
      ...stageSideEffects(stage, data.probability),
      ownerId: data.ownerId === undefined ? req.user!.id : data.ownerId,
    },
    include,
  });
  res.status(201).json(deal);
});

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  const current = await prisma.deal.findUnique({ where: { id: req.params.id } });
  if (!current) throw notFound('Opportunité');
  const stageChanged = data.stage && data.stage !== current.stage;
  const deal = await prisma.deal.update({
    where: { id: current.id },
    data: { ...data, ...(stageChanged ? stageSideEffects(data.stage, data.probability) : {}) },
    include,
  });
  res.json(deal);
});

router.delete('/:id', async (req, res) => {
  const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
  if (!deal) throw notFound('Opportunité');
  assertCanDelete(req.user!, deal.ownerId);
  await prisma.deal.delete({ where: { id: deal.id } });
  res.status(204).end();
});

export default router;
