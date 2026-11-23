# CRM PME / PMI

CRM web pour petites et moyennes entreprises : contacts & entreprises, pipeline commercial, activités, devis & factures, multi-utilisateurs avec rôles.

**Stack** : React 19 + Vite + Tailwind CSS 4 + TanStack Query (client) · Node.js + Express 5 + Prisma 6 + Zod (API) · PostgreSQL 16 (Docker).

## Démarrage rapide

Prérequis : Node.js 20+ et Docker Desktop.

```bash
npm install                 # installe client + serveur (workspaces npm)
cp server/.env.example server/.env   # puis changez JWT_SECRET
npm run db:up               # lance PostgreSQL (port 5433)
npm run db:migrate          # crée les tables
npm run db:seed             # données de démonstration + comptes
npm run dev                 # API :4000 + interface http://localhost:5173
```

Comptes de démonstration (mots de passe dans `server/.env`) :

| Rôle | Email |
| --- | --- |
| Administrateur | `admin@crm.local` |
| Commercial | `commercial@crm.local` |

## Fonctionnalités

- **Tableau de bord** : pipeline en cours et pondéré, gagné du mois, taux de transformation, factures à encaisser / en retard, tâches du jour, affaires gagnées sur 6 mois.
- **Entreprises & contacts** : fiches complètes, recherche, filtres (statut, « mes fiches »), pagination, vue 360° (contacts, opportunités, activités, documents).
- **Pipeline** : Kanban par glisser-déposer (Nouveau → Qualifié → Proposition → Négociation → Gagné / Perdu), probabilité automatique selon l'étape, montants par colonne.
- **Activités** : appels, rendez-vous, emails, tâches, notes ; échéances, assignation, vues « en retard / aujourd'hui / 7 jours / terminées ».
- **Devis & factures** : lignes HT / TVA multi-taux / TTC, devise et TVA par défaut paramétrables, impression / PDF via le navigateur, transformation devis → facture (le devis passe « accepté » et l'opportunité « gagnée »).
  - Numérotation séquentielle par année : `DEV-2026-0001`, `FAC-2026-0001`.
  - Les factures brouillon ont un numéro provisoire ; le numéro définitif est attribué à l'émission (pas de trou dans la séquence).
  - Un document émis n'est plus modifiable ; il peut seulement être annulé.
- **Paiements** : encaissements partiels ou totaux (virement, chèque, espèces, carte, prélèvement), reste à payer, passage automatique en « payée » au solde ; supprimer un paiement fait repasser la facture en « émise ».
- **Avoirs** : une facture émise ne s'annule plus directement ; « Créer un avoir » émet un avoir `AV-2026-0001` du même montant et annule la facture.
- **Recouvrement** : factures non soldées, balance âgée (non échu, 1–30, 31–60, 61–90, + de 90 jours), relance en un clic. La relance est tracée dans l'historique du client, le compteur de relances augmente, et votre messagerie s'ouvre avec un email prérempli : rappel puis « Relance n°2… ».
- **Catalogue produits & services** : prix HT, TVA, unité, référence ; ajout d'une ligne de devis ou de facture en un clic depuis l'éditeur.
- **Import / export CSV** : import de contacts, entreprises et produits, avec correspondance automatique des colonnes, aperçu et rapport d'erreurs par ligne.
  - Formats acceptés : exports Excel FR (Windows-1252, séparateur `;`), Google Sheets et autres CRM.
  - Les doublons sont ignorés : contacts par email, entreprises par nom, produits par nom ou référence. Les entreprises inconnues sont créées automatiquement.
  - Export de toutes les listes (contacts, entreprises, opportunités, factures et avoirs, produits) : fichier CSV qui s'ouvre directement dans Excel.
- **Rôles & droits** (Administration → Rôles & droits) : rôles personnalisables.
  - Chaque rôle a une grille de droits par module : voir, créer, modifier, supprimer, plus des droits spécifiques (encaisser et relancer, émettre des avoirs, import, export, administration).
  - Chaque rôle a aussi une **visibilité** : toutes les fiches, ou seulement celles dont l'utilisateur est responsable. Les devis et factures de ses clients restent visibles.
  - Cinq rôles sont livrés : Administrateur, Manager, Commercial (ses fiches), Comptable, Lecture seule.
  - Le serveur contrôle chaque action ; l'interface masque ce qui n'est pas autorisé. Un changement de droits s'applique immédiatement.
  - Garde-fous : le rôle Administrateur ne peut être ni supprimé ni privé de la gestion des utilisateurs et des rôles, et il reste toujours au moins un administrateur actif.
- **Assistant IA** (bouton ✨ en bas à droite, ou `Ctrl+J`) : répond aux questions sur vos données, propose des actions, rédige des emails et des relances, analyse le pipeline et donne des conseils. Détails dans la section [Assistant IA](#assistant-ia).
- **Utilisateurs & rôles** : *Administrateur* (gestion des utilisateurs et des paramètres, suppression de toute fiche) et *Commercial* (accès à toutes les fiches, suppression uniquement des siennes).
- **Paramètres** : identité de l'entreprise (en-tête des documents), devise (EUR, DZD, MAD, TND, XOF…), TVA par défaut, délai de paiement, RIB, pied de page.

## Structure

```
client/            Interface React (Vite)
  src/pages/       Écrans (Dashboard, Companies, Pipeline, Documents…)
  src/components/  UI réutilisable, formulaires, sélecteurs
  src/lib/         Client API, authentification, formatage, libellés
server/            API Express
  prisma/          Schéma, migrations, données de démo
  src/routes/      Une route par module (auth, companies, contacts, deals, activities, documents…)
  src/middleware/  Authentification JWT (cookie httpOnly) et rôles
scripts/           Test de fumée de l'API
```

## Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | API + interface en mode développement |
| `npm run deploy:local` | Compile puis lance la **version de production** en local sur http://localhost:8080 : un seul serveur, interface compilée, mode production (base Docker requise). Arrêtez d'abord `npm run dev` sous Windows |
| `npm run serve:local` | Relance la version de production déjà compilée, sans recompiler (port modifiable : `PORT_LOCAL`) |
| `npm run typecheck` | Vérification TypeScript client + serveur |
| `npm run test:smoke` | 43 vérifications de bout en bout de l'API (serveur lancé, base seedée). **Crée des données** : à lancer de préférence sur une base de test (voir ci-dessous) |
| `npm run db:studio -w server` | Explorer la base (Prisma Studio) |
| `npm run db:reset` | **Efface toute la base** puis la recrée et la re-seede (développement uniquement) |

### Tests sur une base séparée

Le test de fumée crée des factures, des paiements et des avoirs, qu'on ne peut pas supprimer. Pour garder la base de démo propre, lancez-le sur la base `crm_test` (déjà créée dans le conteneur) :

```bash
cd server
DATABASE_URL="postgresql://crm:crm@localhost:5433/crm_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://crm:crm@localhost:5433/crm_test?schema=public" API_PORT=4100 npx tsx src/index.ts
# dans un autre terminal :
bash scripts/smoke-test.sh http://localhost:4100/api
```

## Assistant IA

L'assistant fonctionne avec tout fournisseur compatible avec l'API OpenAI (`/chat/completions` avec outils) : OpenAI, Mistral, Groq, OpenRouter, DeepSeek, Azure OpenAI, ou un modèle local via Ollama ou LM Studio. Le modèle doit gérer l'appel d'outils (*tool calling*).

Renseignez trois variables dans `server/.env` (ou dans le tableau de bord Render pour la démo), puis redémarrez l'API :

```
AI_API_KEY="votre-clé"
AI_BASE_URL="https://api.openai.com/v1"   # adresse du fournisseur, jusqu'à /v1
AI_MODEL="nom-du-modèle"
```

Variables facultatives : `AI_MAX_STEPS` (appels d'outils par question, 8 par défaut) et `AI_TIMEOUT_MS` (60000 par défaut). Sans configuration, le panneau affiche « Assistant non configuré ».

Fonctionnement :
- L'assistant consulte le CRM **avec les droits de l'utilisateur connecté** : il ne voit que ce que l'utilisateur voit (portée « ses fiches » comprise).
- Il peut créer une tâche ou un rendez-vous, mettre à jour une opportunité ou créer un contact, mais **chaque action doit être confirmée** dans le panneau. Rien n'est écrit sans un clic sur « Confirmer ».
- Le droit **Assistant IA → Utiliser l'assistant** (Rôles & droits) contrôle l'accès ; il est activé pour les cinq rôles livrés.
- Les questions et les données consultées sont envoyées au fournisseur choisi : vérifiez ses conditions avant d'utiliser des données réelles.
- Limite : 40 requêtes par utilisateur toutes les 10 minutes.

## Démo en ligne gratuite (Render)

Le fichier [`render.yaml`](render.yaml) décrit tout le déploiement : une application web et une base PostgreSQL, toutes deux sur l'offre gratuite.

1. Poussez ce dépôt sur GitHub (un dépôt privé convient).
2. Sur [render.com](https://render.com), connectez-vous avec GitHub, puis **New → Blueprint** et choisissez ce dépôt.
3. Render demande `SEED_ADMIN_PASSWORD` et `SEED_SALES_PASSWORD` : choisissez les mots de passe des comptes de démo `admin@crm.local` et `commercial@crm.local`.
4. **Apply**. Le premier déploiement prend 5 à 10 minutes : installation, build, migrations, données de démo. L'adresse publique ressemble à `https://crm-pme-xxxx.onrender.com`.

Limites de l'offre gratuite :
- **Mise en veille** : l'application s'endort après 15 minutes sans visite. La première visite suivante prend environ une minute, le temps qu'elle redémarre. Ouvrez-la juste avant votre démo.
- **Base de données** : la base gratuite expire 30 jours après sa création. Render prévient par email ; il suffit de recréer la base depuis le Blueprint.

Chaque `git push` sur la branche suivie redéploie automatiquement l'application.

## Mise en production

1. Base PostgreSQL gérée, `DATABASE_URL` et un `JWT_SECRET` long et aléatoire, `NODE_ENV=production`.
2. `npm run build` puis `npm run db:deploy -w server`.
3. `npm start` : l'API sert aussi l'interface compilée (`client/dist`) sur `API_PORT`.
4. Placez-la derrière HTTPS (le cookie de session est `secure` en production).
5. Ne lancez pas le seed en production ; créez le premier administrateur via le seed avec vos propres valeurs `SEED_*`, puis changez son mot de passe.

## Pistes d'évolution

Envoi des devis/factures par email depuis le serveur (SMTP), génération PDF côté serveur, relances automatiques planifiées, avoirs partiels, champs personnalisés, journal d'audit, multi-sociétés (multi-tenant), application mobile.
