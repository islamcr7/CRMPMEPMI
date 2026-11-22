export type Role = 'ADMIN' | 'SALES';
export type ContactStatus = 'LEAD' | 'PROSPECT' | 'CUSTOMER' | 'INACTIVE';
export type DealStage = 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type ActivityType = 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'NOTE';
export type DocumentType = 'QUOTE' | 'INVOICE' | 'CREDIT_NOTE';
export type PaymentMethod = 'TRANSFER' | 'CHECK' | 'CASH' | 'CARD' | 'DIRECT_DEBIT' | 'OTHER';
export type DocumentStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REFUSED' | 'PAID' | 'CANCELLED';

/** Les montants Decimal arrivent sous forme de chaînes depuis l'API. */
export type Money = string | number;

export interface UserRef {
  id: string;
  name: string;
}

export interface User extends UserRef {
  email: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Company {
  id: string;
  name: string;
  taxId: string | null;
  industry: string | null;
  size: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  ownerId: string | null;
  owner?: UserRef | null;
  createdAt: string;
  _count?: { contacts: number; deals: number };
  contacts?: Contact[];
  deals?: Deal[];
  activities?: Activity[];
  documents?: DocumentSummary[];
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: ContactStatus;
  source: string | null;
  notes: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  ownerId: string | null;
  owner?: UserRef | null;
  createdAt: string;
  deals?: Deal[];
  activities?: Activity[];
  documents?: DocumentSummary[];
}

export interface Deal {
  id: string;
  title: string;
  amount: Money;
  stage: DealStage;
  probability: number;
  expectedCloseDate: string | null;
  closedAt: string | null;
  notes: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  contactId: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  ownerId: string | null;
  owner?: UserRef | null;
  createdAt: string;
  updatedAt: string;
  activities?: Activity[];
  documents?: DocumentSummary[];
}

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  description: string | null;
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  contactId: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  dealId: string | null;
  deal?: { id: string; title: string } | null;
  assigneeId: string | null;
  assignee?: UserRef | null;
  createdAt: string;
}

export interface DocumentLine {
  id?: string;
  description: string;
  quantity: Money;
  unitPrice: Money;
  taxRate: Money;
}

export interface DocumentSummary {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  issueDate: string;
  dueDate: string | null;
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  reminderCount: number;
  lastReminderAt: string | null;
  companyId: string;
  company?: { id: string; name: string };
  contact?: { id: string; firstName: string; lastName: string } | null;
  owner?: UserRef | null;
}

export interface DocumentFull extends Omit<DocumentSummary, 'company' | 'contact'> {
  notes: string | null;
  company: Company;
  contact: Contact | null;
  contactId: string | null;
  dealId: string | null;
  deal: { id: string; title: string } | null;
  source: { id: string; number: string; type: DocumentType } | null;
  derived: { id: string; number: string; type: DocumentType }[];
  lines: DocumentLine[];
  payments: Payment[];
}

export interface Payment {
  id: string;
  amount: Money;
  date: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdById: string | null;
  createdBy?: UserRef | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: Money;
  taxRate: Money;
  active: boolean;
}

export interface Collections {
  summary: { outstanding: number; overdue: number; count: number; overdueCount: number };
  buckets: { key: string; label: string; amount: number; count: number }[];
  items: {
    id: string;
    number: string;
    issueDate: string;
    dueDate: string | null;
    total: Money;
    amountPaid: Money;
    remaining: number;
    daysLate: number;
    reminderCount: number;
    lastReminderAt: string | null;
    company: { id: string; name: string; email: string | null; phone: string | null };
    contact: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  }[];
}

export interface Organization {
  name: string;
  legalForm: string | null;
  taxId: string | null;
  registryNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  defaultTaxRate: Money;
  paymentTerms: number;
  bankDetails: string | null;
  documentFooter: string | null;
}

export interface Dashboard {
  contacts: { total: number; newThisMonth: number };
  companiesTotal: number;
  setup: { orgConfigured: boolean; contacts: boolean; deals: boolean; products: boolean; quotes: boolean; team: boolean };
  pipeline: { openCount: number; value: number; weighted: number; winRate: number | null };
  stages: { stage: DealStage; count: number; amount: number }[];
  wonByMonth: { month: string; amount: number; collected: number; wonCount: number }[];
  wonThisMonth: number;
  activities: { overdue: number; myTasks: Activity[]; recent: Activity[] };
  invoices: { unpaidCount: number; unpaidTotal: number; overdueCount: number; overdueTotal: number; paidThisYear: number };
}
