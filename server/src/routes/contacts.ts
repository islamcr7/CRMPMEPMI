import { Router } from 'express';
import { z } from 'zod';
import type { ContactStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optId, optStr, pagination, qs } from '../lib/http.js';
import { assertCanDelete } from '../middleware/auth.js';

const router = Router();

const owner = { select: { id: true, name: true } } as const;
const STATUSES = ['LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'] as const;

const schema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(120),
  lastName: z.string().trim().min(1, 'Nom requis').max(120),
  email: optStr(200),
  phone: optStr(40),
  position: optStr(120),
  status: z.enum(STATUSES).optional(),
  source: optStr(120),
  notes: optStr(5000),
  companyId: optId,
  ownerId: optId,
});

router.get('/', async (req, res) => {
  const { skip, take, page, pageSize } = pagination(req);
  const q = qs(req, 'q');
  const status = qs(req, 'status');
  const ownerId = qs(req, 'ownerId');
  const companyId = qs(req, 'companyId');
  const where: Prisma.ContactWhereInput = {
    ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as ContactStatus } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(companyId ? { companyId } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { company: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { owner, company: { select: { id: true, name: true } } },
    }),
    prisma.contact.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      owner,
      company: { select: { id: true, name: true } },
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
  if (!contact) throw notFound('Contact');
  res.json(contact);
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const contact = await prisma.contact.create({
    data: { ...data, ownerId: data.ownerId === undefined ? req.user!.id : data.ownerId },
  });
  res.status(201).json(contact);
});

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  const contact = await prisma.contact.update({ where: { id: req.params.id }, data });
  res.json(contact);
});

router.delete('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) throw notFound('Contact');
  assertCanDelete(req.user!, contact.ownerId);
  await prisma.contact.delete({ where: { id: contact.id } });
  res.status(204).end();
});

export default router;
