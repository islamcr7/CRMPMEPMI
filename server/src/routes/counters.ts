import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

/** Compteurs légers affichés dans le menu latéral (rafraîchis régulièrement). */
router.get('/', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const userId = req.user!.id;

  const [myOverdue, myToday, quotesPending, invoicesOverdue, openDeals] = await Promise.all([
    prisma.activity.count({ where: { assigneeId: userId, done: false, dueDate: { lt: today } } }),
    prisma.activity.count({ where: { assigneeId: userId, done: false, dueDate: { gte: today, lt: tomorrow } } }),
    prisma.document.count({ where: { type: 'QUOTE', status: 'SENT' } }),
    prisma.document.count({ where: { type: 'INVOICE', status: 'SENT', dueDate: { lt: new Date() } } }),
    prisma.deal.count({ where: { stage: { notIn: ['WON', 'LOST'] } } }),
  ]);

  res.json({ myOverdue, myToday, quotesPending, invoicesOverdue, openDeals });
});

export default router;
