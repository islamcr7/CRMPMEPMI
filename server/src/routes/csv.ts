import { Router, type Response } from 'express';
import { z } from 'zod';
import type { ContactStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { assertPerm, can, scope } from '../middleware/auth.js';

/* ======================================================================
 * Export CSV — séparateur « ; » + BOM UTF-8 : s'ouvre directement dans Excel (FR)
 * ==================================================================== */

export const exportRouter = Router();

type Cell = string | number | Date | null | undefined | { toString(): string };

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString().slice(0, 10);
  else if (typeof v === 'number') s = String(v).replace('.', ',');
  else s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Les montants Decimal sont exportés avec une virgule décimale. */
const money = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? '' : v.toString().replace('.', ','));

function sendCsv(res: Response, name: string, header: string[], rows: Cell[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${date}.csv"`);
  res.send('﻿' + body + '\r\n');
}

const STATUS_FR: Record<string, string> = { LEAD: 'Piste', PROSPECT: 'Prospect', CUSTOMER: 'Client', INACTIVE: 'Inactif' };
const STAGE_FR: Record<string, string> = { NEW: 'Nouveau', QUALIFIED: 'Qualifié', PROPOSAL: 'Proposition', NEGOTIATION: 'Négociation', WON: 'Gagné', LOST: 'Perdu' };
const DOC_STATUS_FR: Record<string, string> = { DRAFT: 'Brouillon', SENT: 'Émise', PAID: 'Payée', CANCELLED: 'Annulée', ACCEPTED: 'Accepté', REFUSED: 'Refusé' };

exportRouter.get('/contacts', async (req, res) => {
  assertPerm(req.user!, 'contacts.view');
  const rows = await prisma.contact.findMany({ where: scope.contact(req.user!), orderBy: [{ lastName: 'asc' }], include: { company: true, owner: true } });
  sendCsv(
    res,
    'contacts',
    ['Prénom', 'Nom', 'Email', 'Téléphone', 'Fonction', 'Entreprise', 'Statut', 'Source', 'Responsable', 'Notes', 'Créé le'],
    rows.map((c) => [c.firstName, c.lastName, c.email, c.phone, c.position, c.company?.name, STATUS_FR[c.status], c.source, c.owner?.name, c.notes, c.createdAt]),
  );
});

exportRouter.get('/companies', async (req, res) => {
  assertPerm(req.user!, 'companies.view');
  const rows = await prisma.company.findMany({ where: scope.company(req.user!), orderBy: { name: 'asc' }, include: { owner: true } });
  sendCsv(
    res,
    'entreprises',
    ['Raison sociale', 'Identifiant fiscal', 'Secteur', 'Effectif', 'Email', 'Téléphone', 'Site web', 'Adresse', 'Ville', 'Pays', 'Responsable', 'Notes', 'Créé le'],
    rows.map((c) => [c.name, c.taxId, c.industry, c.size, c.email, c.phone, c.website, c.address, c.city, c.country, c.owner?.name, c.notes, c.createdAt]),
  );
});

exportRouter.get('/deals', async (req, res) => {
  assertPerm(req.user!, 'deals.view');
  const rows = await prisma.deal.findMany({ where: scope.deal(req.user!), orderBy: { createdAt: 'desc' }, include: { company: true, contact: true, owner: true } });
  sendCsv(
    res,
    'opportunites',
    ['Intitulé', 'Entreprise', 'Contact', 'Montant HT', 'Étape', 'Probabilité %', 'Clôture prévue', 'Clôturée le', 'Responsable', 'Créée le'],
    rows.map((d) => [
      d.title,
      d.company?.name,
      d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : '',
      money(d.amount),
      STAGE_FR[d.stage],
      d.probability,
      d.expectedCloseDate,
      d.closedAt,
      d.owner?.name,
      d.createdAt,
    ]),
  );
});

exportRouter.get('/invoices', async (req, res) => {
  assertPerm(req.user!, 'invoices.view');
  const rows = await prisma.document.findMany({
    where: { ...scope.document(req.user!), type: { in: ['INVOICE', 'CREDIT_NOTE'] }, NOT: { number: { startsWith: 'BROUILLON-' } } },
    orderBy: { number: 'asc' },
    include: { company: true },
  });
  sendCsv(
    res,
    'factures',
    ['Type', 'Numéro', 'Client', 'Date', 'Échéance', 'Total HT', 'TVA', 'Total TTC', 'Encaissé', 'Reste dû', 'Statut'],
    rows.map((d) => {
      const sign = d.type === 'CREDIT_NOTE' ? -1 : 1;
      const remaining = d.type === 'INVOICE' && d.status === 'SENT' ? Number(d.total) - Number(d.amountPaid) : 0;
      return [
        d.type === 'CREDIT_NOTE' ? 'Avoir' : 'Facture',
        d.number,
        d.company.name,
        d.issueDate,
        d.dueDate,
        sign * Number(d.subtotal),
        sign * Number(d.taxTotal),
        sign * Number(d.total),
        Number(d.amountPaid),
        Math.round(remaining * 100) / 100,
        d.type === 'CREDIT_NOTE' ? 'Émis' : DOC_STATUS_FR[d.status],
      ];
    }),
  );
});

exportRouter.get('/products', async (req, res) => {
  assertPerm(req.user!, 'products.view');
  const rows = await prisma.product.findMany({ orderBy: { name: 'asc' } });
  sendCsv(
    res,
    'produits',
    ['Nom', 'Référence', 'Description', 'Unité', 'Prix unitaire HT', 'TVA %', 'Actif'],
    rows.map((p) => [p.name, p.sku, p.description, p.unit, money(p.unitPrice), money(p.taxRate), p.active ? 'Oui' : 'Non']),
  );
});

/* ======================================================================
 * Import — le client parse le CSV et envoie des lignes déjà associées aux champs
 * ==================================================================== */

export const importRouter = Router();

const MAX_ROWS = 5000;

/** Chaîne optionnelle tolérante : vide → null */
const s = (max = 500) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const t = String(v).trim();
      return t === '' ? null : t.slice(0, max);
    });

/** Nombre au format FR ou EN : « 1 234,56 », « 1234.56 », « 20 % » */
const num = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const cleaned = v.replace(/[\s  %€$]/g, '').replace(/[A-Za-z]/g, '');
    const normalized = cleaned.includes(',') && cleaned.includes('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(',', '.');
    const n = Number(normalized);
    if (normalized === '' || Number.isNaN(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Nombre invalide : « ${v} »` });
      return z.NEVER;
    }
    return n;
  });

const STATUS_ALIASES: Record<string, ContactStatus> = {
  lead: 'LEAD', piste: 'LEAD', nouveau: 'LEAD',
  prospect: 'PROSPECT',
  customer: 'CUSTOMER', client: 'CUSTOMER', cliente: 'CUSTOMER',
  inactive: 'INACTIVE', inactif: 'INACTIVE', perdu: 'INACTIVE',
};

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const contactRow = z.object({
  firstName: s(120),
  lastName: s(120),
  email: s(200),
  phone: s(40),
  position: s(120),
  companyName: s(200),
  status: s(40),
  source: s(120),
  notes: s(5000),
});

const companyRow = z.object({
  name: s(200),
  taxId: s(60),
  industry: s(120),
  size: s(40),
  email: s(200),
  phone: s(40),
  website: s(200),
  address: s(300),
  city: s(120),
  country: s(120),
  notes: s(5000),
});

const productRow = z.object({
  name: s(200),
  sku: s(60),
  description: s(1000),
  unit: s(30),
  unitPrice: num,
  taxRate: num,
});

const bodySchema = z.object({ rows: z.array(z.record(z.unknown())).min(1, 'Fichier vide').max(MAX_ROWS, `${MAX_ROWS} lignes maximum par import`) });

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** Numéro de ligne dans le fichier (la ligne 1 est l'en-tête). */
const lineNo = (i: number) => i + 2;
const issueMessage = (e: z.ZodError) => e.issues.map((i) => i.message).join(', ');

importRouter.post('/companies', async (req, res) => {
  assertPerm(req.user!, 'companies.create');
  const { rows } = bodySchema.parse(req.body);
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  const existing = new Set((await prisma.company.findMany({ select: { name: true } })).map((c) => norm(c.name)));

  for (const [i, raw] of rows.entries()) {
    const parsed = companyRow.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: lineNo(i), message: issueMessage(parsed.error) });
      continue;
    }
    const { name, ...rest } = parsed.data;
    if (!name) {
      result.errors.push({ row: lineNo(i), message: 'Raison sociale manquante' });
      continue;
    }
    if (existing.has(norm(name))) {
      result.skipped++;
      continue;
    }
    await prisma.company.create({ data: { name, ...rest, ownerId: req.user!.id } });
    existing.add(norm(name));
    result.created++;
  }
  res.json(result);
});

importRouter.post('/contacts', async (req, res) => {
  assertPerm(req.user!, 'contacts.create');
  const canCreateCompanies = can(req.user, 'companies.create');
  const { rows } = bodySchema.parse(req.body);
  const result: ImportResult & { companiesCreated: number } = { created: 0, skipped: 0, errors: [], companiesCreated: 0 };

  const companies = new Map((await prisma.company.findMany({ select: { id: true, name: true } })).map((c) => [norm(c.name), c.id]));
  const emails = new Set(
    (await prisma.contact.findMany({ where: { email: { not: null } }, select: { email: true } })).map((c) => norm(c.email!)),
  );

  for (const [i, raw] of rows.entries()) {
    const parsed = contactRow.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: lineNo(i), message: issueMessage(parsed.error) });
      continue;
    }
    const { companyName, status, ...c } = parsed.data;
    let { firstName, lastName } = c;
    // « Nom complet » dans une seule colonne : on découpe au premier espace
    if (!lastName && firstName?.includes(' ')) {
      const [first, ...last] = firstName.split(/\s+/);
      firstName = first;
      lastName = last.join(' ');
    }
    if (!lastName && !firstName) {
      result.errors.push({ row: lineNo(i), message: 'Nom et prénom manquants' });
      continue;
    }
    if (c.email && emails.has(norm(c.email))) {
      result.skipped++;
      continue;
    }
    const mappedStatus = status ? STATUS_ALIASES[norm(status)] : 'LEAD';
    if (!mappedStatus) {
      result.errors.push({ row: lineNo(i), message: `Statut inconnu « ${status} » (Piste, Prospect, Client, Inactif)` });
      continue;
    }

    let companyId: string | null = null;
    if (companyName) {
      companyId = companies.get(norm(companyName)) ?? null;
      if (!companyId && !canCreateCompanies) {
        result.errors.push({ row: lineNo(i), message: `Entreprise inconnue « ${companyName} » (droit de création d’entreprise requis)` });
        continue;
      }
      if (!companyId) {
        const created = await prisma.company.create({ data: { name: companyName, ownerId: req.user!.id } });
        companyId = created.id;
        companies.set(norm(companyName), created.id);
        result.companiesCreated++;
      }
    }

    await prisma.contact.create({
      data: {
        ...c,
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        status: mappedStatus,
        companyId,
        ownerId: req.user!.id,
      },
    });
    if (c.email) emails.add(norm(c.email));
    result.created++;
  }
  res.json(result);
});

importRouter.post('/products', async (req, res) => {
  assertPerm(req.user!, 'products.manage');
  const { rows } = bodySchema.parse(req.body);
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  const org = await prisma.organization.findUnique({ where: { id: 'default' } });
  const defaultTax = Number(org?.defaultTaxRate ?? 20);
  const existing = await prisma.product.findMany({ select: { name: true, sku: true } });
  const names = new Set(existing.map((p) => norm(p.name)));
  const skus = new Set(existing.filter((p) => p.sku).map((p) => norm(p.sku!)));

  for (const [i, raw] of rows.entries()) {
    const parsed = productRow.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: lineNo(i), message: issueMessage(parsed.error) });
      continue;
    }
    const { name, unitPrice, taxRate, ...rest } = parsed.data;
    if (!name) {
      result.errors.push({ row: lineNo(i), message: 'Nom manquant' });
      continue;
    }
    if (unitPrice === null) {
      result.errors.push({ row: lineNo(i), message: 'Prix manquant' });
      continue;
    }
    if (names.has(norm(name)) || (rest.sku && skus.has(norm(rest.sku)))) {
      result.skipped++;
      continue;
    }
    await prisma.product.create({ data: { name, ...rest, unitPrice, taxRate: taxRate ?? defaultTax } });
    names.add(norm(name));
    if (rest.sku) skus.add(norm(rest.sku));
    result.created++;
  }
  res.json(result);
});

importRouter.post('/:entity', () => {
  throw new HttpError(404, 'Import non disponible pour ce type de données');
});
