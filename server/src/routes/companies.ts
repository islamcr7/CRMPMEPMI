import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optId, optStr, pagination, qs } from '../lib/http.js';
import { assertCanDelete } from '../middleware/auth.js';

const router = Router();

const owner = { select: { id: true, name: true } } as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(200),
  taxId: optStr(60),
  industry: optStr(120),
  size: optStr(40),
  email: optStr(200),
  phone: optStr(40),
  website: optStr(200),
  address: optStr(300),
  city: optStr(120),
  country: optStr(120),
  notes: optStr(5000),
  ownerId: optId,
});

router.get('/', async (req, res) => {
  const { skip, take, page, pageSize } = pagination(req);
  const q = qs(req, 'q');
  const ownerId = qs(req, 'ownerId');
  const where: Prisma.CompanyWhereInput = {
    ...(ownerId ? { ownerId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { industry: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { owner, _count: { select: { contacts: true, deals: true } } },
    }),
    prisma.company.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      owner,
      contacts: { orderBy: { lastName: 'asc' } },
      deals: {
        orderBy: { createdAt: 'desc' },
        include: {
          owner,
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      activities: {
        orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
        take: 50,
        include: { assignee: owner },
      },
      documents: { orderBy: { issueDate: 'desc' }, take: 50 },
    },
  });
  if (!company) throw notFound('Entreprise');
  res.json(company);
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const company = await prisma.company.create({
    data: { ...data, ownerId: data.ownerId === undefined ? req.user!.id : data.ownerId },
  });
  res.status(201).json(company);
});

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  const company = await prisma.company.update({ where: { id: req.params.id }, data });
  res.json(company);
});

router.delete('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) throw notFound('Entreprise');
  assertCanDelete(req.user!, company.ownerId);
  await prisma.company.delete({ where: { id: company.id } });
  res.status(204).end();
});

export default router;
