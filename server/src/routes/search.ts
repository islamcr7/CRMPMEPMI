import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { qs } from '../lib/http.js';
import { dataFilters } from '../lib/visibility.js';

const router = Router();

const LIMIT = 6;

/** Recherche globale : contacts, opportunités et factures. GET /api/search?q=... */
router.get('/', async (req, res) => {
  const q = qs(req, 'q');
  if (!q || q.length < 2) {
    res.json({ contacts: [], deals: [], invoices: [] });
    return;
  }
  const ci = { contains: q, mode: 'insensitive' as const };
  // "Jean Dupont" : chaque mot doit correspondre au prénom ou au nom
  const words = q.split(/\s+/).filter(Boolean);
  // Résultats limités à ce que le rôle peut voir
  const f = dataFilters(req.user!);

  const [contacts, deals, invoices] = await Promise.all([
    prisma.contact.findMany({
      where: {
        AND: [f.contact],
        OR: [
          { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: 'insensitive' as const } }, { lastName: { contains: w, mode: 'insensitive' as const } }] })) },
          { email: ci },
          { phone: { contains: q } },
          { company: { name: ci } },
        ],
      },
      take: LIMIT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, status: true, company: { select: { id: true, name: true } } },
    }),
    prisma.deal.findMany({
      where: { AND: [f.deal], OR: [{ title: ci }, { company: { name: ci } }, { contact: { lastName: ci } }] },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, amount: true, stage: true, company: { select: { id: true, name: true } } },
    }),
    prisma.document.findMany({
      where: { AND: [f.invoice], OR: [{ number: ci }, { company: { name: ci } }] },
      take: LIMIT,
      orderBy: { issueDate: 'desc' },
      select: { id: true, number: true, total: true, status: true, dueDate: true, issueDate: true, company: { select: { id: true, name: true } } },
    }),
  ]);

  res.json({ contacts, deals, invoices });
});

export default router;
