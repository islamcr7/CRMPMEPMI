import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

router.get('/', async (req, res) => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const userId = req.user!.id;

  const [
    contactsTotal,
    contactsNew,
    companiesTotal,
    byStage,
    wonRecent,
    overdueCount,
    myTasks,
    unpaid,
    overdueInvoices,
    paidThisYear,
    recentActivities,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.company.count(),
    prisma.deal.groupBy({ by: ['stage'], _count: { _all: true }, _sum: { amount: true } }),
    prisma.deal.findMany({
      where: { stage: 'WON', closedAt: { gte: sixMonthsAgo } },
      select: { amount: true, closedAt: true },
    }),
    prisma.activity.count({ where: { done: false, dueDate: { lt: today } } }),
    prisma.activity.findMany({
      where: { assigneeId: userId, done: false, dueDate: { lt: tomorrow } },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        deal: { select: { id: true, title: true } },
      },
    }),
    prisma.document.aggregate({ where: { type: 'INVOICE', status: 'SENT' }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.document.aggregate({
      where: { type: 'INVOICE', status: 'SENT', dueDate: { lt: now } },
      _sum: { total: true, amountPaid: true },
      _count: true,
    }),
    // Encaissements réels de l'année (paiements, y compris partiels)
    prisma.payment.aggregate({ where: { date: { gte: yearStart }, document: { status: { not: 'CANCELLED' } } }, _sum: { amount: true } }),
    prisma.activity.findMany({
      where: { done: true },
      orderBy: { completedAt: 'desc' },
      take: 8,
      include: {
        assignee: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const stages = STAGES.map((stage) => {
    const row = byStage.find((r) => r.stage === stage);
    return { stage, count: row?._count._all ?? 0, amount: Number(row?._sum.amount ?? 0) };
  });

  const openDeals = await prisma.deal.findMany({
    where: { stage: { notIn: ['WON', 'LOST'] } },
    select: { amount: true, probability: true },
  });
  const pipelineValue = openDeals.reduce((s, d) => s + Number(d.amount), 0);
  const weightedValue = openDeals.reduce((s, d) => s + (Number(d.amount) * d.probability) / 100, 0);

  const months: { month: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ month: key, amount: 0 });
  }
  for (const d of wonRecent) {
    if (!d.closedAt) continue;
    const key = `${d.closedAt.getFullYear()}-${String(d.closedAt.getMonth() + 1).padStart(2, '0')}`;
    const m = months.find((x) => x.month === key);
    if (m) m.amount += Number(d.amount);
  }

  const won = stages.find((s) => s.stage === 'WON')!;
  const lost = stages.find((s) => s.stage === 'LOST')!;
  const winRate = won.count + lost.count > 0 ? Math.round((won.count / (won.count + lost.count)) * 100) : null;

  res.json({
    contacts: { total: contactsTotal, newThisMonth: contactsNew },
    companiesTotal,
    pipeline: { openCount: openDeals.length, value: pipelineValue, weighted: Math.round(weightedValue), winRate },
    stages,
    wonByMonth: months,
    wonThisMonth: months[months.length - 1].amount,
    activities: { overdue: overdueCount, myTasks, recent: recentActivities },
    invoices: {
      unpaidCount: unpaid._count,
      unpaidTotal: Number(unpaid._sum.total ?? 0) - Number(unpaid._sum.amountPaid ?? 0),
      overdueCount: overdueInvoices._count,
      overdueTotal: Number(overdueInvoices._sum.total ?? 0) - Number(overdueInvoices._sum.amountPaid ?? 0),
      paidThisYear: Number(paidThisYear._sum.amount ?? 0),
    },
  });
});

export default router;
