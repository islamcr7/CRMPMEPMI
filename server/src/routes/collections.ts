import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const DAY = 86400000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Recouvrement : factures émises non soldées, avec retard, reste dû et relances.
 * Balance âgée : non échu, 1–30, 31–60, 61–90, > 90 jours.
 */
router.get('/', async (_req, res) => {
  const invoices = await prisma.document.findMany({
    where: { type: 'INVOICE', status: 'SENT' },
    orderBy: { dueDate: 'asc' },
    include: {
      company: { select: { id: true, name: true, email: true, phone: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [
    { key: 'current', label: 'Non échu', amount: 0, count: 0 },
    { key: '1-30', label: '1 à 30 j', amount: 0, count: 0 },
    { key: '31-60', label: '31 à 60 j', amount: 0, count: 0 },
    { key: '61-90', label: '61 à 90 j', amount: 0, count: 0 },
    { key: '90+', label: '+ de 90 j', amount: 0, count: 0 },
  ];

  const items = invoices.map((inv) => {
    const remaining = round2(Number(inv.total) - Number(inv.amountPaid));
    const daysLate = inv.dueDate ? Math.floor((today.getTime() - new Date(inv.dueDate).setHours(0, 0, 0, 0)) / DAY) : 0;
    const b = daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4;
    buckets[b].amount = round2(buckets[b].amount + remaining);
    buckets[b].count++;
    return {
      id: inv.id,
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      amountPaid: inv.amountPaid,
      remaining,
      daysLate: Math.max(0, daysLate),
      reminderCount: inv.reminderCount,
      lastReminderAt: inv.lastReminderAt,
      company: inv.company,
      contact: inv.contact,
    };
  });

  // Les plus en retard d'abord
  items.sort((a, b) => b.daysLate - a.daysLate || b.remaining - a.remaining);
  const outstanding = round2(items.reduce((s, i) => s + i.remaining, 0));
  const overdue = round2(items.filter((i) => i.daysLate > 0).reduce((s, i) => s + i.remaining, 0));

  res.json({ summary: { outstanding, overdue, count: items.length, overdueCount: items.filter((i) => i.daysLate > 0).length }, buckets, items });
});

export default router;
