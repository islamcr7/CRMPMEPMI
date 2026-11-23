import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { optStr, qs } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';

const router = Router();

const schema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(200),
  sku: optStr(60),
  description: optStr(1000),
  unit: optStr(30),
  unitPrice: z.coerce.number().min(-1e12).max(1e12),
  taxRate: z.coerce.number().min(0).max(100),
  active: z.boolean().optional(),
});

/** ?q=…&active=true|false|all (défaut : true) */
router.get('/', requirePerm('products.view'), async (req, res) => {
  const q = qs(req, 'q');
  const active = qs(req, 'active') ?? 'true';
  const where: Prisma.ProductWhereInput = {
    ...(active === 'all' ? {} : { active: active === 'true' }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const products = await prisma.product.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
  res.json(products);
});

router.post('/', requirePerm('products.manage'), async (req, res) => {
  const product = await prisma.product.create({ data: schema.parse(req.body) });
  res.status(201).json(product);
});

router.patch('/:id', requirePerm('products.manage'), async (req, res) => {
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: schema.partial().parse(req.body) });
  res.json(product);
});

// Les lignes de documents copient les valeurs : supprimer un produit n'altère aucun devis/facture.
router.delete('/:id', requirePerm('products.manage'), async (req, res) => {
  await prisma.product.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
});

export default router;
