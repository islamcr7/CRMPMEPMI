import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { dataFilters } from '../lib/visibility.js';

const router = Router();

/** Compteurs légers affichés dans le menu latéral (rafraîchis régulièrement). */
router.get('/', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const userId = req.user!.id;
  const f = dataFilters(req.user!);

  const [myOverdue, myToday, quotesPending, invoicesOverdue, openDeals] = await Promise.all([
    prisma.activity.count({ where: { AND: [f.activity, { assigneeId: userId, done: false, dueDate: { lt: today } }] } }),
    prisma.activity.count({ where: { AND: [f.activity, { assigneeId: userId, done: false, dueDate: { gte: today, lt: tomorrow } }] } }),
    prisma.document.count({ where: { AND: [f.quote, { status: 'SENT' }] } }),
    prisma.document.count({ where: { AND: [f.invoice, { status: 'SENT', dueDate: { lt: new Date() } }] } }),
    prisma.deal.count({ where: { AND: [f.deal, { stage: { notIn: ['WON', 'LOST'] } }] } }),
  ]);

  res.json({ myOverdue, myToday, quotesPending, invoicesOverdue, openDeals });
});

export default router;
