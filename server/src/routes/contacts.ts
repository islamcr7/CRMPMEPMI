import { Router } from 'express';
import { z } from 'zod';
import type { ContactStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optId, optStr, pagination, qs } from '../lib/http.js';
import { assertAssignable, scope, type AuthUser } from '../middleware/auth.js';
import { relatedIncludes } from '../lib/visibility.js';

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
    AND: [
      scope.contact(req.user!),
      status && (STATUSES as readonly string[]).includes(status) ? { status: status as ContactStatus } : {},
      ownerId ? { ownerId } : {},
      companyId ? { companyId } : {},
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { company: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
  };
  // Tri : ?sort=name|company|status|createdAt&dir=asc|desc
  const dir = qs(req, 'dir') === 'desc' ? 'desc' : 'asc';
  const sortKey = qs(req, 'sort');
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    sortKey === 'company'
      ? [{ company: { name: dir } }]
      : sortKey === 'status' || sortKey === 'createdAt'
        ? [{ [sortKey]: dir }]
        : [{ lastName: dir }, { firstName: dir }];
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      skip,
      take,
      orderBy: [...orderBy, { lastName: 'asc' }],
      include: { owner, company: { select: { id: true, name: true } } },
    }),
    prisma.contact.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  const u = req.user!;
  const contact = await prisma.contact.findFirst({
    where: { id: String(req.params.id), ...scope.contact(u) },
    include: {
      owner,
      company: { select: { id: true, name: true } },
      ...relatedIncludes(u),
    },
  });
  if (!contact) throw notFound('Contact');
  res.json(contact);
});

async function findScoped(id: string, u: AuthUser) {
  const contact = await prisma.contact.findFirst({ where: { id, ...scope.contact(u) } });
  if (!contact) throw notFound('Contact');
  return contact;
}

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  assertAssignable(req.user!, data.ownerId);
  const contact = await prisma.contact.create({
    data: { ...data, ownerId: data.ownerId === undefined ? req.user!.id : data.ownerId },
  });
  res.status(201).json(contact);
});

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  assertAssignable(req.user!, data.ownerId);
  const current = await findScoped(String(req.params.id), req.user!);
  const contact = await prisma.contact.update({ where: { id: current.id }, data });
  res.json(contact);
});

router.delete('/:id', async (req, res) => {
  const contact = await findScoped(String(req.params.id), req.user!);
  await prisma.contact.delete({ where: { id: contact.id } });
  res.status(204).end();
});

export default router;
