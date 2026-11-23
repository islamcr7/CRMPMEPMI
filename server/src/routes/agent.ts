/* ======================================================================
 * Assistant IA du CRM.
 *
 * - Fournisseur : toute API « compatible OpenAI » (POST {AI_BASE_URL}/chat/completions
 *   avec appel d'outils), configurée par AI_API_KEY, AI_BASE_URL et AI_MODEL.
 * - Les outils appellent l'API du CRM avec la session de l'utilisateur : l'agent ne
 *   voit et ne fait que ce que le rôle de l'utilisateur permet (droits + visibilité).
 * - Les outils qui modifient des données ne sont jamais exécutés directement : ils
 *   sont renvoyés à l'interface, qui demande une confirmation à l'utilisateur.
 * - Le serveur ne garde pas l'historique : le client renvoie la conversation à
 *   chaque message (elle ne contient que ce que l'utilisateur a le droit de voir).
 * ==================================================================== */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { aiConfigured, config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { can, requirePerm, type AuthUser } from '../middleware/auth.js';

const router = Router();
router.use(requirePerm('ai.use'));

/* ---------------- Types du format « chat/completions » ---------------- */

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/* ---------------- Appel de l'API du CRM avec la session de l'utilisateur ---------------- */

type Api = (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<Record<string, unknown> & { error?: string }>;

function crmApi(req: Request): Api {
  const base = `http://127.0.0.1:${config.port}/api`;
  const cookie = req.headers.cookie ?? '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) return { error: (data as { error?: string }).error ?? `Erreur ${res.status}` };
    return data as Record<string, unknown>;
  };
}

/* ---------------- Mise en forme compacte des résultats (moins de tokens) ---------------- */

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clean = (o: Obj) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const name = (c?: Obj | null) => (c ? `${c.firstName} ${c.lastName}` : undefined);
const day = (d?: string | null) => (d ? d.slice(0, 10) : undefined);

const contactShort = (c: Obj) =>
  clean({ id: c.id, name: name(c), position: c.position, company: c.company?.name, companyId: c.companyId, email: c.email, phone: c.phone, status: c.status, owner: c.owner?.name });
const companyShort = (c: Obj) =>
  clean({ id: c.id, name: c.name, industry: c.industry, city: c.city, phone: c.phone, email: c.email, owner: c.owner?.name, contacts: c._count?.contacts, deals: c._count?.deals });
const dealShort = (d: Obj) =>
  clean({ id: d.id, title: d.title, amount: num(d.amount), stage: d.stage, probability: d.probability, expectedClose: day(d.expectedCloseDate), closedAt: day(d.closedAt), company: d.company?.name, companyId: d.companyId, contact: name(d.contact), contactId: d.contactId, owner: d.owner?.name });
const activityShort = (a: Obj) =>
  clean({ id: a.id, type: a.type, subject: a.subject, description: a.description?.slice(0, 300), due: a.dueDate?.slice(0, 16), done: a.done, company: a.company?.name, contact: name(a.contact), deal: a.deal?.title, assignee: a.assignee?.name });
const docShort = (d: Obj) =>
  clean({ id: d.id, type: d.type, number: d.number, status: d.status, total: num(d.total), paid: num(d.amountPaid), issued: day(d.issueDate), due: day(d.dueDate), company: d.company?.name, reminders: d.reminderCount || undefined });

/* ---------------- Outils ---------------- */

interface Tool {
  name: string;
  description: string;
  parameters: Obj;
  /** Droits requis pour proposer l'outil au modèle */
  perms: string[];
  /** Outil qui modifie des données : exécuté seulement après confirmation */
  write?: boolean;
  run: (args: Obj, ctx: { api: Api; user: AuthUser }) => Promise<unknown>;
}

const obj = (properties: Obj, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string, extra: Obj = {}) => ({ type: 'string', description, ...extra });
const summaryParam = str('Phrase courte décrivant l’action pour l’utilisateur, dans sa langue (affichée dans la demande de confirmation)');
const qs = (p: Obj) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  return s.toString() ? `?${s}` : '';
};
const pass = (r: Obj, f: (r: Obj) => unknown) => (r.error ? { error: r.error } : f(r));

const TOOLS: Tool[] = [
  {
    name: 'search_crm',
    description: 'Recherche globale par nom, email, numéro ou entreprise : renvoie contacts, opportunités et factures correspondants.',
    parameters: obj({ query: str('Texte recherché (au moins 2 caractères)') }, ['query']),
    perms: [],
    run: async (a, { api }) =>
      pass(await api('GET', `/search${qs({ q: a.query })}`), (r) => ({
        contacts: (r.contacts as Obj[]).map((c) => clean({ id: c.id, name: name(c), company: c.company?.name, email: c.email, status: c.status })),
        deals: (r.deals as Obj[]).map((d) => clean({ id: d.id, title: d.title, amount: num(d.amount), stage: d.stage, company: d.company?.name })),
        invoices: (r.invoices as Obj[]).map(docShort),
      })),
  },
  {
    name: 'list_contacts',
    description: 'Liste des contacts (25 max), filtrable par texte et statut.',
    parameters: obj({ query: str('Nom, email, téléphone ou entreprise'), status: str('Statut', { enum: ['LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'] }) }),
    perms: ['contacts.view'],
    run: async (a, { api }) => pass(await api('GET', `/contacts${qs({ q: a.query, status: a.status, pageSize: 25 })}`), (r) => ({ total: r.total, items: (r.items as Obj[]).map(contactShort) })),
  },
  {
    name: 'get_contact',
    description: 'Fiche complète d’un contact : coordonnées, opportunités, activités récentes, devis et factures.',
    parameters: obj({ id: str('Identifiant du contact') }, ['id']),
    perms: ['contacts.view'],
    run: async (a, { api }) =>
      pass(await api('GET', `/contacts/${encodeURIComponent(a.id)}`), (c) => ({
        ...contactShort(c),
        source: c.source,
        notes: c.notes?.slice(0, 800),
        deals: (c.deals ?? []).map(dealShort),
        activities: (c.activities ?? []).slice(0, 12).map(activityShort),
        documents: (c.documents ?? []).slice(0, 10).map(docShort),
      })),
  },
  {
    name: 'list_companies',
    description: 'Liste des entreprises (25 max), filtrable par nom, ville ou secteur.',
    parameters: obj({ query: str('Texte recherché') }),
    perms: ['companies.view'],
    run: async (a, { api }) => pass(await api('GET', `/companies${qs({ q: a.query, pageSize: 25 })}`), (r) => ({ total: r.total, items: (r.items as Obj[]).map(companyShort) })),
  },
  {
    name: 'get_company',
    description: 'Fiche complète d’une entreprise : informations, contacts, opportunités, activités, devis et factures.',
    parameters: obj({ id: str('Identifiant de l’entreprise') }, ['id']),
    perms: ['companies.view'],
    run: async (a, { api }) =>
      pass(await api('GET', `/companies/${encodeURIComponent(a.id)}`), (c) => ({
        ...companyShort(c),
        taxId: c.taxId,
        address: [c.address, c.city, c.country].filter(Boolean).join(', ') || undefined,
        website: c.website,
        notes: c.notes?.slice(0, 800),
        contacts: (c.contacts ?? []).map(contactShort),
        deals: (c.deals ?? []).map(dealShort),
        activities: (c.activities ?? []).slice(0, 12).map(activityShort),
        documents: (c.documents ?? []).slice(0, 10).map(docShort),
      })),
  },
  {
    name: 'list_deals',
    description: 'Opportunités du pipeline (40 max, les plus gros montants d’abord), filtrables par texte et étape.',
    parameters: obj({
      query: str('Intitulé ou entreprise'),
      stage: str('Étape', { enum: ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] }),
      open_only: { type: 'boolean', description: 'Uniquement les opportunités en cours (ni gagnées ni perdues)' },
    }),
    perms: ['deals.view'],
    run: async (a, { api }) => {
      const r = await api('GET', `/deals${qs({ q: a.query, stage: a.stage })}`);
      if (r.error) return { error: r.error };
      const list = (r as unknown as Obj[]).filter((d) => !a.open_only || !['WON', 'LOST'].includes(d.stage));
      list.sort((x, y) => Number(y.amount) - Number(x.amount));
      return { total: list.length, items: list.slice(0, 40).map(dealShort) };
    },
  },
  {
    name: 'get_deal',
    description: 'Détail d’une opportunité : montant, étape, contact, activités, devis et factures liés.',
    parameters: obj({ id: str('Identifiant de l’opportunité') }, ['id']),
    perms: ['deals.view'],
    run: async (a, { api }) =>
      pass(await api('GET', `/deals/${encodeURIComponent(a.id)}`), (d) => ({
        ...dealShort(d),
        notes: d.notes?.slice(0, 800),
        activities: (d.activities ?? []).slice(0, 12).map(activityShort),
        documents: (d.documents ?? []).map(docShort),
      })),
  },
  {
    name: 'list_activities',
    description: 'Activités (appels, rendez-vous, tâches, notes, emails), filtrables par statut et période.',
    parameters: obj({
      status: str('open = à faire, done = terminées, all = toutes', { enum: ['open', 'done', 'all'] }),
      range: str('overdue = en retard, today = aujourd’hui, week = 7 prochains jours', { enum: ['overdue', 'today', 'week'] }),
      mine: { type: 'boolean', description: 'Uniquement celles assignées à l’utilisateur' },
    }),
    perms: ['activities.view'],
    run: async (a, { api, user }) =>
      pass(await api('GET', `/activities${qs({ status: a.status ?? 'open', range: a.range, assigneeId: a.mine ? user.id : undefined })}`), (r) => {
        const list = r as unknown as Obj[];
        return { total: list.length, items: list.slice(0, 40).map(activityShort) };
      }),
  },
  {
    name: 'list_invoices',
    description: 'Factures (25 max, les plus récentes d’abord). OVERDUE = émises, non payées et échues.',
    parameters: obj({ status: str('Statut', { enum: ['DRAFT', 'SENT', 'PAID', 'CANCELLED', 'OVERDUE'] }), query: str('Numéro ou client') }),
    perms: ['invoices.view'],
    run: async (a, { api }) => pass(await api('GET', `/documents${qs({ type: 'INVOICE', status: a.status, q: a.query, pageSize: 25 })}`), (r) => ({ total: r.total, items: (r.items as Obj[]).map(docShort) })),
  },
  {
    name: 'list_quotes',
    description: 'Devis (25 max, les plus récents d’abord), filtrables par statut ou client.',
    parameters: obj({ status: str('Statut', { enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED'] }), query: str('Numéro ou client') }),
    perms: ['quotes.view'],
    run: async (a, { api }) => pass(await api('GET', `/documents${qs({ type: 'QUOTE', status: a.status, q: a.query, pageSize: 25 })}`), (r) => ({ total: r.total, items: (r.items as Obj[]).map(docShort) })),
  },
  {
    name: 'get_collections',
    description: 'Recouvrement : reste à encaisser, montant en retard, balance âgée et factures les plus en retard.',
    parameters: obj({}),
    perms: ['invoices.view'],
    run: async (_a, { api }) =>
      pass(await api('GET', '/collections'), (r) => ({
        summary: r.summary,
        aging: r.buckets,
        invoices: (r.items as Obj[]).slice(0, 15).map((i) => clean({ id: i.id, number: i.number, company: i.company?.name, remaining: i.remaining, daysLate: i.daysLate, reminders: i.reminderCount, due: day(i.dueDate) })),
      })),
  },
  {
    name: 'get_dashboard',
    description: 'Indicateurs clés : pipeline en cours et pondéré, gagné ce mois, taux de transformation, factures à encaisser, tâches en retard, ventes et encaissements des 6 derniers mois.',
    parameters: obj({}),
    perms: [],
    run: async (_a, { api }) =>
      pass(await api('GET', '/dashboard?months=6'), (d) => ({
        pipeline: d.pipeline,
        wonThisMonth: d.wonThisMonth,
        stages: d.stages,
        months: (d.wonByMonth as Obj[]).map((m) => ({ month: m.month, won: m.amount, collected: m.collected })),
        invoices: d.invoices,
        overdueTasks: (d.activities as Obj).overdue,
        contacts: d.contacts,
      })),
  },

  /* ----- Écriture : confirmation obligatoire ----- */
  {
    name: 'create_activity',
    description: 'Crée une activité : tâche ou rendez-vous à planifier, ou appel, email, note à consigner. Peut être liée à une entreprise, un contact et/ou une opportunité.',
    parameters: obj(
      {
        summary: summaryParam,
        type: str('Type', { enum: ['CALL', 'MEETING', 'EMAIL', 'TASK', 'NOTE'] }),
        subject: str('Objet'),
        description: str('Détails ou compte rendu'),
        dueDate: str('Échéance au format ISO 8601 (ex. 2026-11-25T09:00:00), pour une tâche ou un rendez-vous'),
        done: { type: 'boolean', description: 'true pour consigner une action déjà faite (appel passé, email envoyé)' },
        companyId: str('Identifiant de l’entreprise liée'),
        contactId: str('Identifiant du contact lié'),
        dealId: str('Identifiant de l’opportunité liée'),
      },
      ['summary', 'type', 'subject'],
    ),
    perms: ['activities.create'],
    write: true,
    run: async (a, { api }) => {
      const { summary: _s, ...body } = a;
      return pass(await api('POST', '/activities', body), (r) => ({ ok: true, activity: activityShort(r) }));
    },
  },
  {
    name: 'update_deal',
    description: 'Met à jour une opportunité : étape (dont WON = gagnée, LOST = perdue), montant, probabilité, date de clôture prévue ou notes.',
    parameters: obj(
      {
        summary: summaryParam,
        dealId: str('Identifiant de l’opportunité'),
        stage: str('Nouvelle étape', { enum: ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] }),
        amount: { type: 'number', description: 'Montant HT' },
        probability: { type: 'integer', description: 'Probabilité de 0 à 100' },
        expectedCloseDate: str('Date de clôture prévue (AAAA-MM-JJ)'),
        notes: str('Notes (remplacent les notes existantes)'),
      },
      ['summary', 'dealId'],
    ),
    perms: ['deals.edit'],
    write: true,
    run: async (a, { api }) => {
      const { summary: _s, dealId, ...body } = a;
      return pass(await api('PATCH', `/deals/${encodeURIComponent(dealId)}`, body), (r) => ({ ok: true, deal: dealShort(r) }));
    },
  },
  {
    name: 'create_contact',
    description: 'Crée un contact, éventuellement rattaché à une entreprise existante.',
    parameters: obj(
      {
        summary: summaryParam,
        firstName: str('Prénom'),
        lastName: str('Nom'),
        email: str('Email'),
        phone: str('Téléphone'),
        position: str('Fonction'),
        companyId: str('Identifiant de l’entreprise'),
        status: str('Statut', { enum: ['LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE'] }),
      },
      ['summary', 'firstName', 'lastName'],
    ),
    perms: ['contacts.create'],
    write: true,
    run: async (a, { api }) => {
      const { summary: _s, ...body } = a;
      return pass(await api('POST', '/contacts', body), (r) => ({ ok: true, contact: contactShort(r) }));
    },
  },
];

const toolsFor = (u: AuthUser) => TOOLS.filter((t) => t.perms.every((p) => can(u, p)));

/** Lien vers la fiche concernée par une action réussie (affiché dans l'interface). */
function linkFor(name: string, result: Obj): string | undefined {
  if (name === 'update_deal' && result.deal?.id) return `/deals/${result.deal.id}`;
  if (name === 'create_contact' && result.contact?.id) return `/contacts/${result.contact.id}`;
  return undefined;
}

/* ---------------- Consignes du modèle ---------------- */

async function systemPrompt(u: AuthUser, lang: 'fr' | 'en') {
  const org = await prisma.organization.findUnique({ where: { id: 'default' } });
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `Tu es l'assistant intégré au CRM de l'entreprise « ${org?.name ?? 'CRM'} ». Tu aides ${u.name} (rôle : ${u.roleName}) dans son travail commercial : répondre aux questions sur les données, préparer et effectuer des actions, rédiger des messages, analyser et conseiller.`,
    `Nous sommes le ${today}. Devise : ${org?.currency ?? 'EUR'}. Réponds en ${lang === 'en' ? 'anglais' : 'français'}.`,
    '',
    'Façon de travailler :',
    '- Pour toute donnée du CRM (montants, clients, factures, tâches…), appelle les outils et appuie-toi sur leurs résultats. Si une information est introuvable, dis-le plutôt que de la supposer.',
    u.scope === 'OWN'
      ? '- L’utilisateur ne voit que ses propres fiches : tes résultats sont limités à son portefeuille. Si un outil renvoie une erreur de droits ou « introuvable », explique-le simplement.'
      : '- Si un outil renvoie une erreur de droits, explique simplement que le rôle de l’utilisateur ne le permet pas.',
    '- Pour créer ou modifier quelque chose, appelle directement l’outil correspondant avec un résumé clair : l’interface demande elle-même la confirmation de l’utilisateur avant toute exécution. Avant de modifier une fiche, retrouve son identifiant avec un outil de recherche.',
    '- Quand tu cites une fiche, fais-en un lien markdown : contact [Nom](/contacts/ID), entreprise [Nom](/companies/ID), opportunité [Titre](/deals/ID), devis ou facture [Numéro](/documents/ID).',
    '- Pour rédiger un email, propose un objet et un corps prêts à copier, au ton professionnel et chaleureux, sans inventer de faits absents du CRM.',
    '- Pour conseiller (priorités du jour, opportunités à risque), appuie-toi sur les échéances, les retards, les montants et l’ancienneté des dernières activités, et propose des actions concrètes.',
    '- Sois concis : quelques phrases ou une courte liste, montants formatés avec la devise, dates lisibles.',
  ].join('\n');
}

/* ---------------- Appel du fournisseur ---------------- */

async function callModel(messages: ChatMessage[], tools: Tool[]) {
  const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.ai.apiKey ? { Authorization: `Bearer ${config.ai.apiKey}` } : {}) },
    body: JSON.stringify({
      model: config.ai.model,
      messages,
      ...(tools.length
        ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: 'auto' }
        : {}),
    }),
    signal: AbortSignal.timeout(config.ai.timeoutMs),
  }).catch((e: Error) => {
    console.error('[assistant] fournisseur injoignable :', e.message);
    throw new HttpError(502, 'Le fournisseur IA est injoignable');
  });
  if (!res.ok) {
    console.error('[assistant] erreur fournisseur', res.status, (await res.text().catch(() => '')).slice(0, 500));
    throw new HttpError(502, `Le fournisseur IA a renvoyé une erreur (${res.status})`);
  }
  const data = (await res.json()) as { choices?: { message?: Obj }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new HttpError(502, 'Réponse inattendue du fournisseur IA');
  // Certains fournisseurs renvoient les arguments sous forme d'objet : on normalise en chaîne JSON
  const toolCalls: ToolCall[] | undefined = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((c: Obj, i: number) => ({
        id: String(c.id ?? `call_${Date.now()}_${i}`),
        type: 'function' as const,
        function: { name: String(c.function?.name ?? ''), arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}) },
      }))
    : undefined;
  const assistant: ChatMessage = { role: 'assistant', content: typeof msg.content === 'string' ? msg.content : '', ...(toolCalls?.length ? { tool_calls: toolCalls } : {}) };
  return assistant as Extract<ChatMessage, { role: 'assistant' }>;
}

/* ---------------- Boucle de l'agent ---------------- */

const parseArgs = (raw: string): Obj | null => {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const toolMessage = (id: string, content: unknown): ChatMessage => ({ role: 'tool', tool_call_id: id, content: JSON.stringify(content).slice(0, 12_000) });

/** Appels d'outils du dernier message assistant qui n'ont pas encore de résultat. */
function unanswered(transcript: ChatMessage[]) {
  const last = [...transcript].reverse().find((m) => m.role === 'assistant') as Extract<ChatMessage, { role: 'assistant' }> | undefined;
  if (!last?.tool_calls) return [];
  const answered = new Set(transcript.filter((m) => m.role === 'tool').map((m) => (m as { tool_call_id: string }).tool_call_id));
  return last.tool_calls.filter((c) => !answered.has(c.id));
}

interface Pending {
  id: string;
  tool: string;
  summary: string;
  details: Obj;
}
interface Action {
  summary: string;
  ok: boolean;
  error?: string;
  link?: string;
}

async function runAgent(transcript: ChatMessage[], ctx: { api: Api; user: AuthUser; lang: 'fr' | 'en' }) {
  const tools = toolsFor(ctx.user);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const system: ChatMessage = { role: 'system', content: await systemPrompt(ctx.user, ctx.lang) };

  for (let step = 0; step < config.ai.maxSteps; step++) {
    const assistant = await callModel([system, ...transcript], tools);
    transcript.push(assistant);
    if (!assistant.tool_calls?.length) return { reply: assistant.content, pending: [] as Pending[] };

    const pending: Pending[] = [];
    for (const call of assistant.tool_calls) {
      const tool = byName.get(call.function.name);
      const args = parseArgs(call.function.arguments);
      if (!tool) {
        transcript.push(toolMessage(call.id, { error: `Outil inconnu ou non autorisé pour ce rôle : ${call.function.name}` }));
      } else if (!args) {
        transcript.push(toolMessage(call.id, { error: 'Arguments JSON invalides' }));
      } else if (tool.write) {
        const { summary, ...details } = args;
        pending.push({ id: call.id, tool: tool.name, summary: String(summary || tool.name), details });
      } else {
        try {
          transcript.push(toolMessage(call.id, await tool.run(args, ctx)));
        } catch (e) {
          transcript.push(toolMessage(call.id, { error: e instanceof Error ? e.message : 'Erreur' }));
        }
      }
    }
    // Actions à confirmer : on rend la main à l'interface
    if (pending.length) return { reply: assistant.content, pending };
  }
  const reply = ctx.lang === 'en' ? 'I could not finish within the allowed number of steps. Could you narrow down the request?' : 'Je n’ai pas pu terminer dans le nombre d’étapes autorisé. Pouvez-vous préciser la demande ?';
  transcript.push({ role: 'assistant', content: reply });
  return { reply, pending: [] as Pending[] };
}

/* ---------------- Limitation simple du nombre de requêtes (coût) ---------------- */

const usage = new Map<string, number[]>();
const LIMIT = 40; // requêtes par utilisateur
const WINDOW = 10 * 60 * 1000; // sur 10 minutes
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (usage.get(userId) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) throw new HttpError(429, 'Trop de demandes à l’assistant, réessayez dans quelques minutes');
  recent.push(now);
  usage.set(userId, recent);
}

/* ---------------- Routes ---------------- */

router.get('/status', (_req, res) => {
  res.json({ enabled: aiConfigured(), model: aiConfigured() ? config.ai.model : null });
});

const toolCallSchema = z.object({ id: z.string().max(200), type: z.literal('function'), function: z.object({ name: z.string().max(100), arguments: z.string().max(20_000) }) });
const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().max(8_000) }),
  z.object({ role: z.literal('assistant'), content: z.string().max(20_000), tool_calls: z.array(toolCallSchema).max(20).optional() }),
  z.object({ role: z.literal('tool'), tool_call_id: z.string().max(200), content: z.string().max(20_000) }),
]);
const chatSchema = z.object({
  lang: z.enum(['fr', 'en']).default('fr'),
  transcript: z.array(messageSchema).max(200).default([]),
  message: z.string().trim().min(1).max(4_000).optional(),
  decision: z.object({ approved: z.boolean() }).optional(),
});

/** Garde les ~40 derniers messages en commençant par un message utilisateur (cohérence des appels d'outils). */
function trimHistory(t: ChatMessage[]) {
  if (t.length <= 40) return t;
  let start = t.length - 40;
  while (start < t.length && t[start].role !== 'user') start++;
  return t.slice(start);
}

router.post('/chat', async (req, res) => {
  if (!aiConfigured()) throw new HttpError(503, 'Assistant IA non configuré : renseignez AI_BASE_URL et AI_MODEL (et AI_API_KEY) dans la configuration du serveur');
  const body = chatSchema.parse(req.body);
  const user = req.user!;
  const ctx = { api: crmApi(req), user, lang: body.lang };
  let transcript = body.transcript as ChatMessage[];
  const actions: Action[] = [];
  const open = unanswered(transcript);

  if (body.decision) {
    if (!open.length) throw new HttpError(409, 'Aucune action en attente de confirmation');
    const byName = new Map(toolsFor(user).map((t) => [t.name, t]));
    for (const call of open) {
      const tool = byName.get(call.function.name);
      const args = parseArgs(call.function.arguments);
      const summary = String(args?.summary ?? call.function.name);
      if (!body.decision.approved) {
        transcript.push(toolMessage(call.id, { refused: true, message: 'L’utilisateur a refusé cette action.' }));
        actions.push({ summary, ok: false, error: 'refused' });
        continue;
      }
      if (!tool || !tool.write || !args) {
        transcript.push(toolMessage(call.id, { error: 'Action non autorisée' }));
        actions.push({ summary, ok: false, error: 'Action non autorisée' });
        continue;
      }
      const result = (await tool.run(args, ctx).catch((e: Error) => ({ error: e.message }))) as Obj;
      transcript.push(toolMessage(call.id, result));
      actions.push(result.error ? { summary, ok: false, error: result.error } : { summary, ok: true, link: linkFor(tool.name, result) });
    }
  } else if (body.message) {
    // Nouveau message alors qu'une action attendait : elle est considérée comme refusée
    for (const call of open) transcript.push(toolMessage(call.id, { refused: true, message: 'L’utilisateur n’a pas confirmé cette action.' }));
    transcript.push({ role: 'user', content: body.message });
  } else {
    throw new HttpError(400, 'Message ou décision attendu');
  }

  rateLimit(user.id);
  transcript = trimHistory(transcript);
  const result = await runAgent(transcript, ctx);
  res.json({ reply: result.reply, pending: result.pending, actions, transcript });
});

export default router;
