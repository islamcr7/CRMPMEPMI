import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound, optDate, optId, optStr, pagination, qs } from '../lib/http.js';
import { assertPerm, type AuthUser } from '../middleware/auth.js';
import { documentWhere } from '../lib/visibility.js';

/** Module de droits d'un type de document (un avoir relève des factures). */
const mod = (type: DocumentType) => (type === 'QUOTE' ? 'quotes' : 'invoices');

/** Document visible par l'utilisateur (droits de lecture + portée), sinon 404. */
async function findVisible(id: string, u: AuthUser) {
  const doc = await prisma.document.findFirst({ where: { id, ...documentWhere(u) } });
  if (!doc) throw notFound('Document');
  return doc;
}

const router = Router();

/** Types créables directement (un avoir se crée depuis une facture). */
const TYPES = ['QUOTE', 'INVOICE'] as const;
const ALL_TYPES = ['QUOTE', 'INVOICE', 'CREDIT_NOTE'] as const;
const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'PAID', 'CANCELLED'] as const;
const ALLOWED_STATUS: Record<DocumentType, DocumentStatus[]> = {
  QUOTE: ['DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED'],
  INVOICE: ['DRAFT', 'SENT', 'PAID'],
  CREDIT_NOTE: ['SENT'],
};
const PREFIX: Record<DocumentType, string> = { QUOTE: 'DEV', INVOICE: 'FAC', CREDIT_NOTE: 'AV' };
const METHODS = ['TRANSFER', 'CHECK', 'CASH', 'CARD', 'DIRECT_DEBIT', 'OTHER'] as const;

const listInclude = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  owner: { select: { id: true, name: true } },
} as const;

const fullInclude = {
  ...listInclude,
  company: true,
  contact: true,
  deal: { select: { id: true, title: true } },
  source: { select: { id: true, number: true, type: true } },
  derived: { select: { id: true, number: true, type: true } },
  lines: { orderBy: { position: 'asc' } },
  payments: { orderBy: { date: 'asc' }, include: { createdBy: { select: { id: true, name: true } } } },
} satisfies Prisma.DocumentInclude;

const lineSchema = z.object({
  description: z.string().trim().min(1, 'Description requise').max(1000),
  quantity: z.coerce.number().min(0).max(1e9),
  unitPrice: z.coerce.number().min(-1e12).max(1e12),
  taxRate: z.coerce.number().min(0).max(100),
});

const baseSchema = z.object({
  companyId: z.string().min(1, 'Client requis'),
  contactId: optId,
  dealId: optId,
  issueDate: optDate,
  dueDate: optDate,
  notes: optStr(5000),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne').max(200),
});

const createSchema = baseSchema.extend({ type: z.enum(TYPES) });
const updateSchema = baseSchema.partial().extend({ status: z.enum(STATUSES).optional() });

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeTotals(lines: z.infer<typeof lineSchema>[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    const ht = round2(l.quantity * l.unitPrice);
    subtotal += ht;
    taxTotal += round2((ht * l.taxRate) / 100);
  }
  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);
  return { subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

const linesCreate = (lines: z.infer<typeof lineSchema>[]) => lines.map((l, position) => ({ ...l, position }));

/** Numéro définitif, séquentiel par type et par année : DEV-2026-0001, FAC-2026-0001, AV-2026-0001. */
async function nextNumber(tx: Prisma.TransactionClient, type: DocumentType) {
  const key = `${PREFIX[type]}-${new Date().getFullYear()}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(4, '0')}`;
}

/** Les factures en brouillon reçoivent un numéro provisoire : la numérotation définitive reste continue. */
const draftNumber = () => `BROUILLON-${randomBytes(4).toString('hex').toUpperCase()}`;
const isDraftNumber = (n: string) => n.startsWith('BROUILLON-');

async function defaultDueDate(type: DocumentType, issueDate: Date) {
  const org = await prisma.organization.findUnique({ where: { id: 'default' } });
  const days = type === 'QUOTE' ? 30 : org?.paymentTerms ?? 30;
  return new Date(issueDate.getTime() + days * 86400000);
}

router.get('/', async (req, res) => {
  const { skip, take, page, pageSize } = pagination(req);
  // type=INVOICE ou type=INVOICE,CREDIT_NOTE
  const types = (qs(req, 'type') ?? '').split(',').filter((t): t is DocumentType => (ALL_TYPES as readonly string[]).includes(t));
  const status = qs(req, 'status');
  const q = qs(req, 'q');
  const where: Prisma.DocumentWhereInput = {
    AND: [documentWhere(req.user!)],
    ...(types.length ? { type: { in: types } } : {}),
    ...(status === 'OVERDUE'
      ? { type: 'INVOICE', status: 'SENT', dueDate: { lt: new Date() } }
      : status && (STATUSES as readonly string[]).includes(status)
        ? { status: status as DocumentStatus }
        : {}),
    ...(qs(req, 'companyId') ? { companyId: qs(req, 'companyId') } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { company: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, skip, take, include: listInclude, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.document.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/:id', async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: String(req.params.id), ...documentWhere(req.user!) }, include: fullInclude });
  if (!doc) throw notFound('Document');
  res.json(doc);
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  assertPerm(req.user!, `${mod(data.type)}.create`);
  const issueDate = data.issueDate ?? new Date();
  const dueDate = data.dueDate === undefined || data.dueDate === null ? await defaultDueDate(data.type, issueDate) : data.dueDate;
  const doc = await prisma.$transaction(async (tx) =>
    tx.document.create({
      data: {
        type: data.type,
        number: data.type === 'QUOTE' ? await nextNumber(tx, 'QUOTE') : draftNumber(),
        companyId: data.companyId,
        contactId: data.contactId ?? null,
        dealId: data.dealId ?? null,
        notes: data.notes ?? null,
        issueDate,
        dueDate,
        ownerId: req.user!.id,
        ...computeTotals(data.lines),
        lines: { create: linesCreate(data.lines) },
      },
      include: fullInclude,
    }),
  );
  res.status(201).json(doc);
});

router.patch('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  const current = await findVisible(String(req.params.id), req.user!);

  const { status, lines, ...fields } = data;
  // Solder une facture relève de l'encaissement ; le reste (contenu, émission, refus…) de la modification
  assertPerm(req.user!, status === 'PAID' ? 'invoices.payments' : `${mod(current.type)}.edit`);
  const editsContent = lines !== undefined || Object.values(fields).some((v) => v !== undefined);
  if (editsContent && current.status !== 'DRAFT') {
    throw new HttpError(409, 'Seuls les brouillons sont modifiables. Annulez et recréez le document si nécessaire.');
  }
  if (current.type === 'INVOICE' && status === 'CANCELLED') {
    throw new HttpError(409, current.status === 'DRAFT' ? 'Supprimez le brouillon au lieu de l’annuler' : 'Une facture émise s’annule par un avoir');
  }
  if (status && !ALLOWED_STATUS[current.type].includes(status)) {
    throw new HttpError(400, `Statut non valide pour ce type de document`);
  }
  if (status === 'DRAFT' && current.status !== 'DRAFT') {
    throw new HttpError(409, 'Un document émis ne peut pas repasser en brouillon');
  }
  if (current.type === 'INVOICE' && status === 'PAID' && current.status !== 'SENT') {
    throw new HttpError(409, 'Seule une facture émise peut être marquée payée');
  }

  const doc = await prisma.$transaction(async (tx) => {
    // « Marquer payée » : enregistre un paiement du reste dû pour garder l'historique cohérent
    if (current.type === 'INVOICE' && status === 'PAID') {
      const remaining = round2(Number(current.total) - Number(current.amountPaid));
      if (remaining > 0) {
        await tx.payment.create({ data: { documentId: current.id, amount: remaining, createdById: req.user!.id, notes: 'Solde' } });
      }
      await tx.document.update({ where: { id: current.id }, data: { amountPaid: current.total } });
    }
    let number: string | undefined;
    // Attribution du numéro définitif de facture à l'émission
    if (status && status !== 'DRAFT' && status !== 'CANCELLED' && isDraftNumber(current.number)) {
      number = await nextNumber(tx, current.type);
    }
    if (lines) {
      await tx.documentLine.deleteMany({ where: { documentId: current.id } });
      await tx.documentLine.createMany({ data: linesCreate(lines).map((l) => ({ ...l, documentId: current.id })) });
    }
    const update: Prisma.DocumentUncheckedUpdateInput = { ...fields, issueDate: fields.issueDate ?? undefined };
    if (status) update.status = status;
    if (number) update.number = number;
    if (lines) Object.assign(update, computeTotals(lines));
    return tx.document.update({ where: { id: current.id }, data: update, include: fullInclude });
  });
  res.json(doc);
});

/* ---------------- Paiements ---------------- */

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Le montant doit être positif').max(1e12),
  date: optDate,
  method: z.enum(METHODS).optional(),
  reference: optStr(120),
  notes: optStr(500),
});

/** Recalcule le montant encaissé et le statut payé / émis. */
async function syncPaid(tx: Prisma.TransactionClient, documentId: string) {
  const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
  const agg = await tx.payment.aggregate({ where: { documentId }, _sum: { amount: true } });
  const paid = round2(Number(agg._sum.amount ?? 0));
  const fullyPaid = paid >= Number(doc.total) - 0.005;
  let status = doc.status;
  if (doc.status === 'SENT' && fullyPaid) status = 'PAID';
  if (doc.status === 'PAID' && !fullyPaid) status = 'SENT';
  return tx.document.update({ where: { id: documentId }, data: { amountPaid: paid, status }, include: fullInclude });
}

router.post('/:id/payments', async (req, res) => {
  const data = paymentSchema.parse(req.body);
  assertPerm(req.user!, 'invoices.payments');
  const doc = await findVisible(String(req.params.id), req.user!);
  if (doc.type !== 'INVOICE') throw new HttpError(400, 'Les paiements ne concernent que les factures');
  if (doc.status !== 'SENT') throw new HttpError(409, doc.status === 'PAID' ? 'Cette facture est déjà soldée' : 'La facture doit être émise pour recevoir un paiement');
  const remaining = round2(Number(doc.total) - Number(doc.amountPaid));
  if (data.amount > remaining + 0.005) {
    throw new HttpError(400, `Le montant dépasse le reste à payer (${remaining.toFixed(2)})`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        documentId: doc.id,
        amount: data.amount,
        date: data.date ?? new Date(),
        method: data.method ?? 'TRANSFER',
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        createdById: req.user!.id,
      },
    });
    return syncPaid(tx, doc.id);
  });
  res.status(201).json(updated);
});

router.delete('/:id/payments/:paymentId', async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: String(req.params.paymentId) }, include: { document: true } });
  assertPerm(req.user!, 'invoices.payments');
  await findVisible(String(req.params.id), req.user!);
  if (!payment || payment.documentId !== req.params.id) throw notFound('Paiement');
  if (payment.document.status === 'CANCELLED') throw new HttpError(409, 'Facture annulée : paiement non modifiable');
  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } });
    return syncPaid(tx, payment.documentId);
  });
  res.json(updated);
});

/* ---------------- Avoir ---------------- */

/** Annule une facture émise par un avoir du même montant (AV-AAAA-NNNN). */
router.post('/:id/credit-note', async (req, res) => {
  assertPerm(req.user!, 'invoices.credit');
  await findVisible(String(req.params.id), req.user!);
  const invoice = await prisma.document.findUnique({ where: { id: String(req.params.id) }, include: { lines: true, derived: true } });
  if (!invoice) throw notFound('Facture');
  if (invoice.type !== 'INVOICE') throw new HttpError(400, 'Un avoir ne peut être créé que depuis une facture');
  if (invoice.status !== 'SENT' && invoice.status !== 'PAID') throw new HttpError(409, 'Seule une facture émise peut faire l’objet d’un avoir');
  if (invoice.derived.some((d) => d.type === 'CREDIT_NOTE')) throw new HttpError(409, 'Un avoir existe déjà pour cette facture');

  const creditNote = await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } });
    return tx.document.create({
      data: {
        type: 'CREDIT_NOTE',
        status: 'SENT',
        number: await nextNumber(tx, 'CREDIT_NOTE'),
        companyId: invoice.companyId,
        contactId: invoice.contactId,
        dealId: invoice.dealId,
        sourceId: invoice.id,
        issueDate: new Date(),
        notes: `Avoir annulant la facture ${invoice.number}.`,
        ownerId: req.user!.id,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        lines: {
          create: invoice.lines.map(({ description, quantity, unitPrice, taxRate, position }) => ({ description, quantity, unitPrice, taxRate, position })),
        },
      },
      include: fullInclude,
    });
  });
  res.status(201).json(creditNote);
});

/* ---------------- Relances ---------------- */

/** Enregistre une relance (compteur + activité dans l'historique) et renvoie un brouillon d'email. */
router.post('/:id/reminders', async (req, res) => {
  assertPerm(req.user!, 'invoices.payments');
  await findVisible(String(req.params.id), req.user!);
  const invoice = await prisma.document.findUnique({ where: { id: String(req.params.id) }, include: { company: true, contact: true } });
  if (!invoice) throw notFound('Facture');
  if (invoice.type !== 'INVOICE' || invoice.status !== 'SENT') throw new HttpError(409, 'Seule une facture émise non soldée peut être relancée');
  const org = await prisma.organization.findUnique({ where: { id: 'default' } });

  const n = invoice.reminderCount + 1;
  const remaining = round2(Number(invoice.total) - Number(invoice.amountPaid));
  const fmt = (v: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: org?.currency ?? 'EUR' }).format(v);
  const due = invoice.dueDate ? invoice.dueDate.toLocaleDateString('fr-FR') : '—';
  const greeting = invoice.contact ? `Bonjour ${invoice.contact.firstName} ${invoice.contact.lastName},` : 'Bonjour,';
  const subject = `${n > 1 ? `Relance n°${n} – ` : 'Rappel – '}facture ${invoice.number} en attente de règlement`;
  const body = [
    greeting,
    '',
    n > 1
      ? `Malgré notre précédent rappel, nous constatons que la facture ${invoice.number} du ${invoice.issueDate.toLocaleDateString('fr-FR')}, échue le ${due}, reste impayée.`
      : `Sauf erreur de notre part, la facture ${invoice.number} du ${invoice.issueDate.toLocaleDateString('fr-FR')}, échue le ${due}, n’a pas encore été réglée.`,
    `Montant restant dû : ${fmt(remaining)}.`,
    '',
    'Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais. Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.',
    ...(org?.bankDetails ? ['', `Coordonnées bancaires : ${org.bankDetails}`] : []),
    '',
    'Cordialement,',
    req.user!.name,
    org?.name ?? '',
  ].join('\n');

  await prisma.$transaction([
    prisma.document.update({ where: { id: invoice.id }, data: { reminderCount: n, lastReminderAt: new Date() } }),
    prisma.activity.create({
      data: {
        type: 'EMAIL',
        subject: `Relance n°${n} – facture ${invoice.number} (${fmt(remaining)})`,
        done: true,
        completedAt: new Date(),
        companyId: invoice.companyId,
        contactId: invoice.contactId,
        dealId: invoice.dealId,
        assigneeId: req.user!.id,
        createdById: req.user!.id,
      },
    }),
  ]);

  res.json({ reminderCount: n, email: { to: invoice.contact?.email ?? invoice.company.email ?? '', subject, body } });
});

/** Transforme un devis en facture (brouillon) et marque le devis comme accepté. */
router.post('/:id/convert', async (req, res) => {
  assertPerm(req.user!, 'quotes.edit', 'invoices.create');
  await findVisible(String(req.params.id), req.user!);
  const quote = await prisma.document.findUnique({ where: { id: String(req.params.id) }, include: { lines: true, derived: true } });
  if (!quote) throw notFound('Devis');
  if (quote.type !== 'QUOTE') throw new HttpError(400, 'Seul un devis peut être transformé en facture');
  if (['REFUSED', 'CANCELLED'].includes(quote.status)) throw new HttpError(409, 'Ce devis est refusé ou annulé');
  if (quote.derived.some((d) => d.type === 'INVOICE')) throw new HttpError(409, 'Une facture existe déjà pour ce devis');

  const issueDate = new Date();
  const dueDate = await defaultDueDate('INVOICE', issueDate);
  const invoice = await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
    if (quote.dealId) {
      await tx.deal.updateMany({
        where: { id: quote.dealId, stage: { notIn: ['WON', 'LOST'] } },
        data: { stage: 'WON', probability: 100, closedAt: new Date() },
      });
    }
    return tx.document.create({
      data: {
        type: 'INVOICE',
        number: draftNumber(),
        companyId: quote.companyId,
        contactId: quote.contactId,
        dealId: quote.dealId,
        sourceId: quote.id,
        notes: quote.notes,
        issueDate,
        dueDate,
        ownerId: req.user!.id,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
        lines: {
          create: quote.lines.map(({ description, quantity, unitPrice, taxRate, position }) => ({
            description,
            quantity,
            unitPrice,
            taxRate,
            position,
          })),
        },
      },
      include: fullInclude,
    });
  });
  res.status(201).json(invoice);
});

router.delete('/:id', async (req, res) => {
  const doc = await findVisible(String(req.params.id), req.user!);
  assertPerm(req.user!, `${mod(doc.type)}.delete`);
  if (doc.status !== 'DRAFT') throw new HttpError(409, 'Seuls les brouillons peuvent être supprimés. Utilisez « Annuler ».');
  await prisma.document.delete({ where: { id: doc.id } });
  res.status(204).end();
});

export default router;
