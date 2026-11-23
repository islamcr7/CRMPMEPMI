import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { optStr } from '../lib/http.js';
import { requirePerm } from '../middleware/auth.js';

const router = Router();

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  legalForm: optStr(60),
  taxId: optStr(60),
  registryNumber: optStr(60),
  email: optStr(200),
  phone: optStr(40),
  address: optStr(300),
  city: optStr(120),
  country: optStr(120),
  currency: z.string().trim().length(3).toUpperCase(),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  paymentTerms: z.coerce.number().int().min(0).max(365),
  bankDetails: optStr(500),
  documentFooter: optStr(1000),
});

router.get('/', async (_req, res) => {
  const org = await prisma.organization.upsert({ where: { id: 'default' }, create: {}, update: {} });
  res.json(org);
});

router.put('/', requirePerm('admin.settings'), async (req, res) => {
  const data = schema.parse(req.body);
  const org = await prisma.organization.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  });
  res.json(org);
});

export default router;
