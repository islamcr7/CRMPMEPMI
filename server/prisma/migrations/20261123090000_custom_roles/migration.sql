-- Rôles personnalisables : table AppRole, rattachement des utilisateurs existants,
-- puis suppression de l'ancien rôle figé (ADMIN / SALES).

-- CreateEnum
CREATE TYPE "DataScope" AS ENUM ('OWN', 'ALL');

-- CreateTable
CREATE TABLE "AppRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "scope" "DataScope" NOT NULL DEFAULT 'ALL',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppRole_name_key" ON "AppRole"("name");

-- Rôles livrés par défaut (générés depuis server/src/lib/permissions.ts)
INSERT INTO "AppRole" ("id", "name", "description", "permissions", "scope", "system", "createdAt", "updatedAt") VALUES
  ('role_admin', 'Administrateur', 'Accès complet, y compris utilisateurs, rôles et paramètres', ARRAY['companies.view', 'companies.create', 'companies.edit', 'companies.delete', 'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'deals.view', 'deals.create', 'deals.edit', 'deals.delete', 'activities.view', 'activities.create', 'activities.edit', 'activities.delete', 'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.payments', 'invoices.credit', 'products.view', 'products.manage', 'data.import', 'data.export', 'admin.users', 'admin.roles', 'admin.settings']::TEXT[], 'ALL'::"DataScope", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_manager', 'Manager', 'Pilote l’équipe commerciale : voit et gère toutes les fiches', ARRAY['companies.view', 'companies.create', 'companies.edit', 'companies.delete', 'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'deals.view', 'deals.create', 'deals.edit', 'deals.delete', 'activities.view', 'activities.create', 'activities.edit', 'activities.delete', 'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.payments', 'products.view', 'products.manage', 'data.import', 'data.export']::TEXT[], 'ALL'::"DataScope", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_sales', 'Commercial', 'Gère ses propres clients, opportunités et devis', ARRAY['companies.view', 'companies.create', 'companies.edit', 'companies.delete', 'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'deals.view', 'deals.create', 'deals.edit', 'deals.delete', 'activities.view', 'activities.create', 'activities.edit', 'activities.delete', 'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'invoices.view', 'invoices.create', 'invoices.edit', 'products.view', 'data.import', 'data.export']::TEXT[], 'OWN'::"DataScope", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_accountant', 'Comptable', 'Facturation, encaissements et avoirs ; consultation du reste', ARRAY['companies.view', 'contacts.view', 'deals.view', 'activities.view', 'activities.create', 'quotes.view', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.payments', 'invoices.credit', 'products.view', 'products.manage', 'data.export']::TEXT[], 'ALL'::"DataScope", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_readonly', 'Lecture seule', 'Consulte toutes les fiches sans pouvoir rien modifier', ARRAY['companies.view', 'contacts.view', 'deals.view', 'activities.view', 'quotes.view', 'invoices.view', 'products.view']::TEXT[], 'ALL'::"DataScope", false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
;

-- Rattachement des utilisateurs existants : ADMIN → Administrateur, SALES → Commercial
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
UPDATE "User" SET "roleId" = CASE WHEN "role" = 'ADMIN' THEN 'role_admin' ELSE 'role_sales' END;
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AppRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Suppression de l'ancien rôle figé
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role";
