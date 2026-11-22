import type { ActivityType, ContactStatus, DealStage, DocumentStatus, DocumentType, PaymentMethod } from '../types';

import { t } from './i18n';
export type Tone = 'slate' | 'blue' | 'indigo' | 'violet' | 'amber' | 'green' | 'red' | 'cyan';

export const STAGES: { value: DealStage; label: string; tone: Tone }[] = [
  { value: 'NEW', label: t('Nouveau'), tone: 'slate' },
  { value: 'QUALIFIED', label: t('Qualifié'), tone: 'blue' },
  { value: 'PROPOSAL', label: t('Proposition'), tone: 'indigo' },
  { value: 'NEGOTIATION', label: t('Négociation'), tone: 'amber' },
  { value: 'WON', label: t('Gagné'), tone: 'green' },
  { value: 'LOST', label: t('Perdu'), tone: 'red' },
];

export const CONTACT_STATUSES: { value: ContactStatus; label: string; tone: Tone }[] = [
  { value: 'LEAD', label: t('Piste'), tone: 'slate' },
  { value: 'PROSPECT', label: t('Prospect'), tone: 'blue' },
  { value: 'CUSTOMER', label: t('Client'), tone: 'green' },
  { value: 'INACTIVE', label: t('Inactif'), tone: 'red' },
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'CALL', label: t('Appel') },
  { value: 'MEETING', label: t('Rendez-vous') },
  { value: 'EMAIL', label: t('Email') },
  { value: 'TASK', label: t('Tâche') },
  { value: 'NOTE', label: t('Note') },
];

export const DOC_TYPES: Record<DocumentType, { label: string; plural: string }> = {
  QUOTE: { label: t('Devis'), plural: t('Devis') },
  INVOICE: { label: t('Facture'), plural: t('Factures') },
  CREDIT_NOTE: { label: t('Avoir'), plural: t('Avoirs') },
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: t('Virement') },
  { value: 'CHECK', label: t('Chèque') },
  { value: 'CASH', label: t('Espèces') },
  { value: 'CARD', label: t('Carte bancaire') },
  { value: 'DIRECT_DEBIT', label: t('Prélèvement') },
  { value: 'OTHER', label: t('Autre') },
];

export const DOC_STATUSES: Record<DocumentStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: t('Brouillon'), tone: 'slate' },
  SENT: { label: t('Envoyé'), tone: 'blue' },
  ACCEPTED: { label: t('Accepté'), tone: 'green' },
  REFUSED: { label: t('Refusé'), tone: 'red' },
  PAID: { label: t('Payée'), tone: 'green' },
  CANCELLED: { label: t('Annulé'), tone: 'red' },
};

export const COMPANY_SIZES = ['1-9', '10-49', '50-249', '250+'];

export const label = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label ?? v;
export const tone = <T extends string>(list: { value: T; tone: Tone }[], v: T): Tone => list.find((x) => x.value === v)?.tone ?? 'slate';
