/* ======================================================================
 * Catalogue des droits : « module.action ».
 * Source unique : le serveur contrôle avec, l'interface affiche la grille
 * à partir de GET /api/roles/catalog.
 * ==================================================================== */

export const ACTION_LABELS: Record<string, string> = {
  view: 'Voir',
  create: 'Créer',
  edit: 'Modifier',
  delete: 'Supprimer',
  payments: 'Encaisser et relancer',
  credit: 'Émettre des avoirs',
  manage: 'Gérer',
  import: 'Importer',
  export: 'Exporter',
  users: 'Gérer les utilisateurs',
  roles: 'Gérer les rôles',
  settings: 'Modifier les paramètres',
  use: 'Utiliser l’assistant',
};

export const MODULES = [
  { key: 'companies', label: 'Entreprises', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'contacts', label: 'Contacts', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'deals', label: 'Opportunités', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'activities', label: 'Activités', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'quotes', label: 'Devis', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'invoices', label: 'Factures', actions: ['view', 'create', 'edit', 'delete', 'payments', 'credit'] },
  { key: 'products', label: 'Produits', actions: ['view', 'manage'] },
  { key: 'data', label: 'Import / export', actions: ['import', 'export'] },
  { key: 'ai', label: 'Assistant IA', actions: ['use'] },
  { key: 'admin', label: 'Administration', actions: ['users', 'roles', 'settings'] },
] as const;

export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) => m.actions.map((a) => `${m.key}.${a}`));
const isPerm = (p: string) => ALL_PERMISSIONS.includes(p);

/** Droits indispensables au rôle Administrateur (évite de se retrouver sans accès). */
export const ADMIN_LOCKED = ['admin.users', 'admin.roles'];

const pick = (...groups: string[][]) => [...new Set(groups.flat())].filter(isPerm);
const crud = (m: string, actions = ['view', 'create', 'edit', 'delete']) => actions.map((a) => `${m}.${a}`);
const views = MODULES.map((m) => `${m.key}.view`).filter(isPerm);

/** Rôles livrés par défaut (identifiants fixes, utilisés aussi par la migration). */
export const DEFAULT_ROLES = [
  {
    id: 'role_admin',
    name: 'Administrateur',
    description: 'Accès complet, y compris utilisateurs, rôles et paramètres',
    scope: 'ALL' as const,
    system: true,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: 'role_manager',
    name: 'Manager',
    description: 'Pilote l’équipe commerciale : voit et gère toutes les fiches',
    scope: 'ALL' as const,
    system: false,
    permissions: pick(
      crud('companies'),
      crud('contacts'),
      crud('deals'),
      crud('activities'),
      crud('quotes'),
      crud('invoices', ['view', 'create', 'edit', 'payments']),
      ['products.view', 'products.manage', 'data.import', 'data.export', 'ai.use'],
    ),
  },
  {
    id: 'role_sales',
    name: 'Commercial',
    description: 'Gère ses propres clients, opportunités et devis',
    scope: 'OWN' as const,
    system: false,
    permissions: pick(
      crud('companies'),
      crud('contacts'),
      crud('deals'),
      crud('activities'),
      crud('quotes'),
      ['invoices.view', 'invoices.create', 'invoices.edit', 'products.view', 'data.import', 'data.export', 'ai.use'],
    ),
  },
  {
    id: 'role_accountant',
    name: 'Comptable',
    description: 'Facturation, encaissements et avoirs ; consultation du reste',
    scope: 'ALL' as const,
    system: false,
    permissions: pick(
      ['companies.view', 'contacts.view', 'deals.view', 'activities.view', 'activities.create', 'quotes.view'],
      crud('invoices', ['view', 'create', 'edit', 'delete', 'payments', 'credit']),
      ['products.view', 'products.manage', 'data.export', 'ai.use'],
    ),
  },
  {
    id: 'role_readonly',
    name: 'Lecture seule',
    description: 'Consulte toutes les fiches sans pouvoir rien modifier',
    scope: 'ALL' as const,
    system: false,
    permissions: pick(views, ['ai.use']),
  },
];

/** Nettoie une liste reçue du client : droits connus uniquement, sans doublon. */
export const sanitizePermissions = (list: string[]) => [...new Set(list)].filter(isPerm);
