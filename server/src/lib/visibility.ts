import type { DocumentType, Prisma } from '@prisma/client';
import { can, scope, type AuthUser } from '../middleware/auth.js';

/** Types de documents visibles selon les droits (devis / factures et avoirs). */
export function visibleDocTypes(u: AuthUser): DocumentType[] {
  return [...(can(u, 'quotes.view') ? (['QUOTE'] as const) : []), ...(can(u, 'invoices.view') ? (['INVOICE', 'CREDIT_NOTE'] as const) : [])];
}

export function documentWhere(u: AuthUser): Prisma.DocumentWhereInput {
  return { ...scope.document(u), type: { in: visibleDocTypes(u) } };
}

/** Aucun résultat : utilisé quand le rôle n'a pas le droit de lecture. */
export const NONE = { id: '__aucun__' } as const;

/** Un filtre par type de données, combinant droit de lecture et portée (pour les agrégats). */
export function dataFilters(u: AuthUser) {
  return {
    company: (can(u, 'companies.view') ? scope.company(u) : NONE) as Prisma.CompanyWhereInput,
    contact: (can(u, 'contacts.view') ? scope.contact(u) : NONE) as Prisma.ContactWhereInput,
    deal: (can(u, 'deals.view') ? scope.deal(u) : NONE) as Prisma.DealWhereInput,
    activity: (can(u, 'activities.view') ? scope.activity(u) : NONE) as Prisma.ActivityWhereInput,
    invoice: (can(u, 'invoices.view') ? { ...scope.document(u), type: 'INVOICE' } : NONE) as Prisma.DocumentWhereInput,
    quote: (can(u, 'quotes.view') ? { ...scope.document(u), type: 'QUOTE' } : NONE) as Prisma.DocumentWhereInput,
  };
}

/** Listes associées d'une fiche (entreprise, contact, opportunité), filtrées par droits et portée. */
export function relatedIncludes(u: AuthUser) {
  const owner = { select: { id: true, name: true } } as const;
  const none = { id: '__aucun__' };
  return {
    deals: {
      where: can(u, 'deals.view') ? scope.deal(u) : none,
      orderBy: { createdAt: 'desc' as const },
      include: { owner, company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
    },
    activities: {
      where: can(u, 'activities.view') ? scope.activity(u) : none,
      orderBy: [{ done: 'asc' as const }, { dueDate: 'asc' as const }],
      take: 50,
      include: { assignee: owner },
    },
    documents: { where: documentWhere(u), orderBy: { issueDate: 'desc' as const }, take: 50 },
  };
}
