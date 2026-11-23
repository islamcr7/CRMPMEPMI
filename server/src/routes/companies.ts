import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, optId, optStr, pagination, qs } from '../lib/http.js';
import { assertAssignable, can, scope, type AuthUser } from '../middleware/auth.js';
import { relatedIncludes } from '../lib/visibility.js';

// Droits contrôlés au montage : requireCrud('companies') (voir index.ts)
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
    AND: [
      scope.company(req.user!),
      ownerId ? { ownerId } : {},
      q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { industry: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
  // Tri : ?sort=name|city|industry|createdAt&dir=asc|desc
  const dir = qs(req, 'dir') === 'desc' ? 'desc' : 'asc';
  const sortKey = qs(req, 'sort');
  const orderBy: Prisma.CompanyOrderByWithRelationInput =
    sortKey === 'city' || sortKey === 'industry' || sortKey === 'createdAt'
      ? { [sortKey]: { sort: dir, nulls: 'last' } }
      : { name: dir };
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take,
      orderBy: [orderBy, { name: 'asc' }],
      include: { owner, _count: { select: { contacts: true, deals: true } } },
    }),
    prisma.company.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  const u = req.user!;
  const company = await prisma.company.findFirst({
    where: { id: String(req.params.id), ...scope.company(u) },
    include: {
      owner,
      contacts: { where: can(u, 'contacts.view') ? scope.contact(u) : { id: '__aucun__' }, orderBy: { lastName: 'asc' } },
      ...relatedIncludes(u),
    },
  });
  if (!company) throw notFound('Entreprise');
  res.json(company);
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  assertAssignable(req.user!, data.ownerId);
  const company = await prisma.company.create({
    data: { ...data, ownerId: data.ownerId === undefined ? req.user!.id : data.ownerId },
  });
  res.status(201).json(company);
});

/** Fiche dans la portée de l'utilisateur, sinon 404. */
async function findScoped(id: string, u: AuthUser) {
  const company = await prisma.company.findFirst({ where: { id, ...scope.company(u) } });
  if (!company) throw notFound('Entreprise');
  return company;
}

router.patch('/:id', async (req, res) => {
  const data = schema.partial().parse(req.body);
  assertAssignable(req.user!, data.ownerId);
  const current = await findScoped(String(req.params.id), req.user!);
  const company = await prisma.company.update({ where: { id: current.id }, data });
  res.json(company);
});

router.delete('/:id', async (req, res) => {
  const company = await findScoped(String(req.params.id), req.user!);
  await prisma.company.delete({ where: { id: company.id } });
  res.status(204).end();
});

export default router;
