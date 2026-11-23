import 'dotenv/config';
import { PrismaClient, type DealStage } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const days = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const salesPassword = process.env.SEED_SALES_PASSWORD ?? 'Commercial123!';

  if (process.env.NODE_ENV === 'production' && (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_SALES_PASSWORD)) {
    throw new Error('En production, définissez SEED_ADMIN_PASSWORD et SEED_SALES_PASSWORD (pas de mot de passe par défaut en ligne).');
  }

  if ((await prisma.user.count()) > 0) {
    console.log('La base contient déjà des utilisateurs : seed ignoré.');
    return;
  }

  await prisma.organization.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      name: 'Ma PME SARL',
      legalForm: 'SARL',
      email: 'contact@ma-pme.example',
      phone: '+33 1 23 45 67 89',
      address: '10 rue de l’Industrie',
      city: 'Lyon',
      country: 'France',
      currency: 'EUR',
      defaultTaxRate: 20,
      paymentTerms: 30,
      documentFooter: 'Merci pour votre confiance.',
    },
    update: {},
  });

  const admin = await prisma.user.create({
    data: { email: adminEmail, name: 'Administrateur', roleId: 'role_admin', passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  const sales = await prisma.user.create({
    data: {
      email: 'commercial@crm.local',
      name: 'Sophie Martin',
      roleId: 'role_sales',
      passwordHash: await bcrypt.hash(salesPassword, 10),
    },
  });

  const companiesData = [
    { name: 'Atelier Mécanique Durand', industry: 'Industrie', size: '10-49', city: 'Lyon', phone: '04 72 00 00 01' },
    { name: 'Boulangeries Lemoine', industry: 'Agroalimentaire', size: '50-249', city: 'Villeurbanne', phone: '04 72 00 00 02' },
    { name: 'Transports Rapides SA', industry: 'Logistique', size: '50-249', city: 'Grenoble', phone: '04 76 00 00 03' },
    { name: 'Cabinet Conseil Bernard', industry: 'Services', size: '1-9', city: 'Annecy', phone: '04 50 00 00 04' },
    { name: 'Plastiques du Rhône', industry: 'Industrie', size: '10-49', city: 'Vienne', phone: '04 74 00 00 05' },
  ];
  const companies = [];
  for (const [i, c] of companiesData.entries()) {
    companies.push(
      await prisma.company.create({
        data: { ...c, country: 'France', ownerId: i % 2 === 0 ? sales.id : admin.id },
      }),
    );
  }

  const contactsData = [
    { firstName: 'Paul', lastName: 'Durand', position: 'Gérant', status: 'CUSTOMER', c: 0 },
    { firstName: 'Claire', lastName: 'Lemoine', position: 'Directrice achats', status: 'PROSPECT', c: 1 },
    { firstName: 'Karim', lastName: 'Benali', position: 'Responsable logistique', status: 'PROSPECT', c: 2 },
    { firstName: 'Julie', lastName: 'Bernard', position: 'Associée', status: 'LEAD', c: 3 },
    { firstName: 'Marc', lastName: 'Rousseau', position: 'Directeur technique', status: 'CUSTOMER', c: 4 },
    { firstName: 'Nadia', lastName: 'Haddad', position: 'Comptable', status: 'LEAD', c: 2 },
  ] as const;
  const contacts = [];
  for (const [i, c] of contactsData.entries()) {
    contacts.push(
      await prisma.contact.create({
        data: {
          firstName: c.firstName,
          lastName: c.lastName,
          position: c.position,
          status: c.status,
          email: `${c.firstName}.${c.lastName}@example.com`.toLowerCase(),
          phone: `06 00 00 00 0${i}`,
          source: i % 2 ? 'Salon professionnel' : 'Recommandation',
          companyId: companies[c.c].id,
          ownerId: companies[c.c].ownerId,
        },
      }),
    );
  }

  const dealsData: { title: string; amount: number; stage: DealStage; probability: number; c: number; close: number }[] = [
    { title: 'Maintenance annuelle machines', amount: 18000, stage: 'NEGOTIATION', probability: 75, c: 0, close: 15 },
    { title: 'Équipement 3 nouveaux points de vente', amount: 42000, stage: 'PROPOSAL', probability: 50, c: 1, close: 30 },
    { title: 'Logiciel de suivi de flotte', amount: 25500, stage: 'QUALIFIED', probability: 25, c: 2, close: 45 },
    { title: 'Audit organisationnel', amount: 6000, stage: 'NEW', probability: 10, c: 3, close: 60 },
    { title: 'Moules injection série B', amount: 31000, stage: 'WON', probability: 100, c: 4, close: -20 },
    { title: 'Contrat formation sécurité', amount: 4500, stage: 'WON', probability: 100, c: 0, close: -50 },
    { title: 'Extension entrepôt', amount: 80000, stage: 'LOST', probability: 0, c: 2, close: -10 },
  ];
  const deals = [];
  for (const d of dealsData) {
    const company = companies[d.c];
    deals.push(
      await prisma.deal.create({
        data: {
          title: d.title,
          amount: d.amount,
          stage: d.stage,
          probability: d.probability,
          expectedCloseDate: days(d.close),
          closedAt: d.stage === 'WON' || d.stage === 'LOST' ? days(d.close) : null,
          companyId: company.id,
          contactId: contacts.find((c) => c.companyId === company.id)?.id,
          ownerId: company.ownerId,
        },
      }),
    );
  }

  await prisma.activity.createMany({
    data: [
      { type: 'CALL', subject: 'Relancer Claire Lemoine sur la proposition', dueDate: days(0), companyId: companies[1].id, contactId: contacts[1].id, dealId: deals[1].id, assigneeId: sales.id, createdById: admin.id },
      { type: 'MEETING', subject: 'Démo logiciel flotte', dueDate: days(3), companyId: companies[2].id, contactId: contacts[2].id, dealId: deals[2].id, assigneeId: sales.id, createdById: sales.id },
      { type: 'EMAIL', subject: 'Envoyer la grille tarifaire', dueDate: days(-2), companyId: companies[3].id, contactId: contacts[3].id, assigneeId: admin.id, createdById: admin.id },
      { type: 'TASK', subject: 'Préparer le contrat de maintenance', dueDate: days(1), companyId: companies[0].id, dealId: deals[0].id, assigneeId: admin.id, createdById: admin.id },
      { type: 'NOTE', subject: 'Client satisfait de la livraison série A', done: true, completedAt: days(-5), companyId: companies[4].id, contactId: contacts[4].id, assigneeId: admin.id, createdById: admin.id },
      { type: 'CALL', subject: 'Point de suivi trimestriel', done: true, completedAt: days(-1), companyId: companies[0].id, contactId: contacts[0].id, assigneeId: sales.id, createdById: sales.id },
    ],
  });

  await prisma.product.createMany({
    data: [
      { name: 'Journée de conseil', sku: 'SRV-CONSEIL', unit: 'jour', unitPrice: 850, taxRate: 20 },
      { name: 'Heure de maintenance', sku: 'SRV-MAINT', unit: 'heure', unitPrice: 65, taxRate: 20 },
      { name: 'Formation sécurité (session)', sku: 'SRV-FORM', unit: 'session', unitPrice: 1500, taxRate: 20 },
      { name: 'Four professionnel', sku: 'EQP-FOUR', unit: 'pièce', unitPrice: 9000, taxRate: 20 },
      { name: 'Frais de déplacement', sku: 'FRAIS-DEP', unit: 'forfait', unitPrice: 120, taxRate: 20 },
    ],
  });

  // Un devis et une facture d'exemple
  await prisma.counter.create({ data: { key: `DEV-${new Date().getFullYear()}`, value: 1 } });
  await prisma.counter.create({ data: { key: `FAC-${new Date().getFullYear()}`, value: 1 } });
  await prisma.document.create({
    data: {
      type: 'QUOTE',
      number: `DEV-${new Date().getFullYear()}-0001`,
      status: 'SENT',
      issueDate: days(-3),
      dueDate: days(27),
      companyId: companies[1].id,
      contactId: contacts[1].id,
      dealId: deals[1].id,
      ownerId: sales.id,
      subtotal: 42000,
      taxTotal: 8400,
      total: 50400,
      lines: {
        create: [
          { position: 0, description: 'Four professionnel', quantity: 3, unitPrice: 9000, taxRate: 20 },
          { position: 1, description: 'Installation et mise en service', quantity: 3, unitPrice: 5000, taxRate: 20 },
        ],
      },
    },
  });
  await prisma.document.create({
    data: {
      type: 'INVOICE',
      number: `FAC-${new Date().getFullYear()}-0001`,
      status: 'SENT',
      issueDate: days(-20),
      dueDate: days(10),
      companyId: companies[4].id,
      contactId: contacts[4].id,
      dealId: deals[4].id,
      ownerId: admin.id,
      subtotal: 31000,
      taxTotal: 6200,
      total: 37200,
      lines: { create: [{ position: 0, description: 'Moules injection série B', quantity: 1, unitPrice: 31000, taxRate: 20 }] },
    },
  });

  console.log('Données de démonstration créées.');
  console.log(`  Admin      : ${adminEmail}`);
  console.log('  Commercial : commercial@crm.local');
  console.log('  (mots de passe définis dans server/.env)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
