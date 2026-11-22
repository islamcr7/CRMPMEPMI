import type { ActivityType, ContactStatus, DealStage, DocumentStatus, DocumentType, PaymentMethod } from '../types';

export type Tone = 'slate' | 'blue' | 'indigo' | 'violet' | 'amber' | 'green' | 'red' | 'cyan';

export const STAGES: { value: DealStage; label: string; tone: Tone }[] = [
  { value: 'NEW', label: 'Nouveau', tone: 'slate' },
  { value: 'QUALIFIED', label: 'Qualifié', tone: 'blue' },
  { value: 'PROPOSAL', label: 'Proposition', tone: 'indigo' },
  { value: 'NEGOTIATION', label: 'Négociation', tone: 'amber' },
  { value: 'WON', label: 'Gagné', tone: 'green' },
  { value: 'LOST', label: 'Perdu', tone: 'red' },
];

export const CONTACT_STATUSES: { value: ContactStatus; label: string; tone: Tone }[] = [
  { value: 'LEAD', label: 'Piste', tone: 'slate' },
  { value: 'PROSPECT', label: 'Prospect', tone: 'blue' },
  { value: 'CUSTOMER', label: 'Client', tone: 'green' },
  { value: 'INACTIVE', label: 'Inactif', tone: 'red' },
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'CALL', label: 'Appel' },
  { value: 'MEETING', label: 'Rendez-vous' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TASK', label: 'Tâche' },
  { value: 'NOTE', label: 'Note' },
];

export const DOC_TYPES: Record<DocumentType, { label: string; plural: string }> = {
  QUOTE: { label: 'Devis', plural: 'Devis' },
  INVOICE: { label: 'Facture', plural: 'Factures' },
  CREDIT_NOTE: { label: 'Avoir', plural: 'Avoirs' },
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: 'Virement' },
  { value: 'CHECK', label: 'Chèque' },
  { value: 'CASH', label: 'Espèces' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'DIRECT_DEBIT', label: 'Prélèvement' },
  { value: 'OTHER', label: 'Autre' },
];

export const DOC_STATUSES: Record<DocumentStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  SENT: { label: 'Envoyé', tone: 'blue' },
  ACCEPTED: { label: 'Accepté', tone: 'green' },
  REFUSED: { label: 'Refusé', tone: 'red' },
  PAID: { label: 'Payée', tone: 'green' },
  CANCELLED: { label: 'Annulé', tone: 'red' },
};

export const COMPANY_SIZES = ['1-9', '10-49', '50-249', '250+'];

export const label = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label ?? v;
export const tone = <T extends string>(list: { value: T; tone: Tone }[], v: T): Tone => list.find((x) => x.value === v)?.tone ?? 'slate';
