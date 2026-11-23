#!/usr/bin/env bash
# Test de fumée de l'API (nécessite `npm run dev` et la base seedée).
# Usage : bash scripts/smoke-test.sh [http://localhost:5173/api]
set -u
B=${1:-http://localhost:5173/api}
ENV_FILE="$(dirname "$0")/../server/.env"
J="Content-Type: application/json"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PW=$(grep SEED_ADMIN_PASSWORD "$ENV_FILE" | cut -d'"' -f2)
SPW=$(grep SEED_SALES_PASSWORD "$ENV_FILE" | cut -d'"' -f2)
pick() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')||'{}');const f=$1;console.log(f(d))"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (attendu: $3, obtenu: $2)"; FAIL=1; fi; }

echo "Auth"
check "mauvais mot de passe -> 401" "$(code -X POST $B/auth/login -H "$J" -d '{"email":"admin@crm.local","password":"x"}')" 401
check "sans session -> 401" "$(code $B/contacts)" 401
check "connexion admin" "$(code -c $TMP/a -X POST $B/auth/login -H "$J" -d "{\"email\":\"admin@crm.local\",\"password\":\"$PW\"}")" 200
check "connexion commercial" "$(code -c $TMP/s -X POST $B/auth/login -H "$J" -d "{\"email\":\"commercial@crm.local\",\"password\":\"$SPW\"}")" 200

echo "Lecture"
check "tableau de bord" "$(code -b $TMP/a $B/dashboard)" 200
check "recherche contacts 'lem'" "$(curl -s -b $TMP/a "$B/contacts?q=lem" | pick 'd=>d.items[0]?.lastName')" Lemoine
CO=$(curl -s -b $TMP/a "$B/companies?q=Bernard" | pick 'd=>d.items[0].id')

echo "Opportunités"
check "validation titre vide -> 400" "$(code -b $TMP/a -X POST $B/deals -H "$J" -d '{"title":""}')" 400
DEAL=$(curl -s -b $TMP/a -X POST $B/deals -H "$J" -d "{\"title\":\"Test smoke\",\"amount\":1000,\"companyId\":\"$CO\"}" | pick 'd=>d.id')
check "changement d'étape -> probabilité auto" "$(curl -s -b $TMP/a -X PATCH $B/deals/$DEAL -H "$J" -d '{"stage":"NEGOTIATION"}' | pick 'd=>d.stage+":"+d.probability')" NEGOTIATION:75

echo "Devis -> facture"
Q=$(curl -s -b $TMP/a -X POST $B/documents -H "$J" -d "{\"type\":\"QUOTE\",\"companyId\":\"$CO\",\"dealId\":\"$DEAL\",\"lines\":[{\"description\":\"Audit\",\"quantity\":2,\"unitPrice\":333.33,\"taxRate\":20},{\"description\":\"Frais\",\"quantity\":1,\"unitPrice\":50,\"taxRate\":10}]}" | pick 'd=>d.id')
check "totaux du devis (HT/TVA/TTC)" "$(curl -s -b $TMP/a $B/documents/$Q | pick 'd=>[d.subtotal,d.taxTotal,d.total].join("/")')" 716.66/138.33/854.99
check "modification des lignes du brouillon" "$(curl -s -b $TMP/a -X PATCH $B/documents/$Q -H "$J" -d '{"issueDate":null,"lines":[{"description":"Audit","quantity":3,"unitPrice":100,"taxRate":20}]}' | pick 'd=>d.total+":"+d.lines.length')" 360:1
check "envoi du devis" "$(curl -s -b $TMP/a -X PATCH $B/documents/$Q -H "$J" -d '{"status":"SENT"}' | pick 'd=>d.status')" SENT
check "devis envoyé non modifiable -> 409" "$(code -b $TMP/a -X PATCH $B/documents/$Q -H "$J" -d '{"notes":"x"}')" 409
INV=$(curl -s -b $TMP/a -X POST $B/documents/$Q/convert | pick 'd=>d.id')
check "facture créée en brouillon" "$(curl -s -b $TMP/a $B/documents/$INV | pick 'd=>d.status+":"+d.number.startsWith("BROUILLON-")+":"+d.total')" DRAFT:true:360
check "opportunité passée gagnée" "$(curl -s -b $TMP/a $B/deals/$DEAL | pick 'd=>d.stage+":"+d.probability')" WON:100
check "double conversion -> 409" "$(code -b $TMP/a -X POST $B/documents/$Q/convert)" 409
check "émission -> numéro définitif" "$(curl -s -b $TMP/a -X PATCH $B/documents/$INV -H "$J" -d '{"status":"SENT"}' | pick 'd=>/^FAC-\d{4}-\d{4}$/.test(d.number)')" true
check "facture payée" "$(curl -s -b $TMP/a -X PATCH $B/documents/$INV -H "$J" -d '{"status":"PAID"}' | pick 'd=>d.status')" PAID
check "statut invalide pour une facture -> 400" "$(code -b $TMP/a -X PATCH $B/documents/$INV -H "$J" -d '{"status":"ACCEPTED"}')" 400

echo "Paiements, relances, avoirs"
INV2=$(curl -s -b $TMP/a -X POST $B/documents -H "$J" -d "{\"type\":\"INVOICE\",\"companyId\":\"$CO\",\"dueDate\":\"2020-01-01\",\"lines\":[{\"description\":\"Mission\",\"quantity\":1,\"unitPrice\":1000,\"taxRate\":20}]}" | pick 'd=>d.id')
check "paiement refusé sur brouillon -> 409" "$(code -b $TMP/a -X POST $B/documents/$INV2/payments -H "$J" -d '{"amount":100}')" 409
curl -s -b $TMP/a -X PATCH $B/documents/$INV2 -H "$J" -d '{"status":"SENT"}' >/dev/null
check "annulation directe d'une facture émise -> 409" "$(code -b $TMP/a -X PATCH $B/documents/$INV2 -H "$J" -d '{"status":"CANCELLED"}')" 409
check "paiement partiel" "$(curl -s -b $TMP/a -X POST $B/documents/$INV2/payments -H "$J" -d '{"amount":"400","method":"CHECK"}' | pick 'd=>d.status+":"+d.amountPaid')" SENT:400
check "paiement supérieur au reste -> 400" "$(code -b $TMP/a -X POST $B/documents/$INV2/payments -H "$J" -d '{"amount":900}')" 400
check "facture en retard dans le recouvrement" "$(curl -s -b $TMP/a $B/collections | pick "d=>d.items.find(i=>i.id==='$INV2')?.remaining")" 800
check "relance -> compteur + email" "$(curl -s -b $TMP/a -X POST $B/documents/$INV2/reminders | pick 'd=>d.reminderCount+":"+d.email.subject.includes("FAC-")')" 1:true
check "solde -> payée" "$(curl -s -b $TMP/a -X POST $B/documents/$INV2/payments -H "$J" -d '{"amount":800}' | pick 'd=>d.status+":"+d.payments.length')" PAID:2
PID=$(curl -s -b $TMP/a $B/documents/$INV2 | pick 'd=>d.payments[1].id')
check "suppression d'un paiement -> repasse émise" "$(curl -s -b $TMP/a -X DELETE $B/documents/$INV2/payments/$PID | pick 'd=>d.status+":"+d.amountPaid')" SENT:400
CN=$(curl -s -b $TMP/a -X POST $B/documents/$INV2/credit-note | pick 'd=>d.type+":"+/^AV-\d{4}-\d{4}$/.test(d.number)+":"+d.total')
check "avoir émis avec numéro AV-" "$CN" CREDIT_NOTE:true:1200
check "facture annulée par l'avoir" "$(curl -s -b $TMP/a $B/documents/$INV2 | pick 'd=>d.status')" CANCELLED
check "second avoir -> 409" "$(code -b $TMP/a -X POST $B/documents/$INV2/credit-note)" 409

echo "Catalogue & CSV"
check "prix « 12,5 » refusé par l'API JSON -> 400" "$(code -b $TMP/a -X POST $B/products -H "$J" -d '{"name":"Produit smoke","unitPrice":"12,5","taxRate":20}')" 400
check "produit créé (prix valide)" "$(code -b $TMP/a -X POST $B/products -H "$J" -d '{"name":"Produit smoke","unitPrice":12.5,"taxRate":20}')" 201
check "commercial ne supprime pas un produit -> 403" "$(code -b $TMP/s -X DELETE $B/products/$(curl -s -b $TMP/a "$B/products?q=smoke" | pick 'd=>d[0].id'))" 403
check "import produits (format FR, doublon, erreur)" "$(curl -s -b $TMP/a -X POST $B/import/products -H "$J" -d '{"rows":[{"name":"Import A","unitPrice":"1 234,50","taxRate":"20 %"},{"name":"produit SMOKE","unitPrice":"1"},{"name":"Import B","unitPrice":"abc"}]}' | pick 'd=>d.created+":"+d.skipped+":"+d.errors.length+":"+d.errors[0]?.row')" 1:1:1:4
check "prix importé" "$(curl -s -b $TMP/a "$B/products?q=Import%20A" | pick 'd=>d[0].unitPrice')" 1234.5
check "import contacts (entreprise créée, statut FR, nom complet)" "$(curl -s -b $TMP/a -X POST $B/import/contacts -H "$J" -d '{"rows":[{"firstName":"Jean Smoke Dupont","email":"jean.smoke@example.com","companyName":"Smoke Industries","status":"Client"},{"lastName":"X","email":"JEAN.SMOKE@example.com"},{"lastName":"Y","status":"bizarre"}]}' | pick 'd=>d.created+":"+d.skipped+":"+d.errors.length+":"+d.companiesCreated')" 1:1:1:1
check "contact importé découpé" "$(curl -s -b $TMP/a "$B/contacts?q=jean.smoke" | pick 'd=>d.items[0].firstName+"|"+d.items[0].lastName+"|"+d.items[0].status+"|"+d.items[0].company.name')" "Jean|Smoke Dupont|CUSTOMER|Smoke Industries"
check "export contacts CSV (BOM + ;)" "$(curl -s -b $TMP/a $B/export/contacts | head -c 30 | node -e "const s=require('fs').readFileSync(0,'utf8');console.log(s.charCodeAt(0)===0xFEFF && s.includes('Prénom;Nom'))")" true
check "export factures contient l'avoir" "$(curl -s -b $TMP/a $B/export/invoices | grep -c '^Avoir;AV-')" 1

echo "Activités"
check "création (assignée à soi)" "$(curl -s -b $TMP/a -X POST $B/activities -H "$J" -d "{\"type\":\"CALL\",\"subject\":\"Appel smoke\",\"companyId\":\"$CO\",\"dueDate\":\"2020-01-01T10:00:00Z\"}" | pick 'd=>d.assignee.name')" Administrateur
check "apparaît en retard" "$(curl -s -b $TMP/a "$B/activities?range=overdue&q=smoke" | pick 'd=>d.length')" 1

echo "Droits"
check "commercial ne modifie pas les paramètres -> 403" "$(code -b $TMP/s -X PUT $B/settings -H "$J" -d '{}')" 403
check "commercial (ses fiches) ne voit pas la fiche d'un autre -> 404" "$(code -b $TMP/s -X DELETE $B/deals/$DEAL)" 404
check "entreprise avec factures non supprimable -> 409" "$(code -b $TMP/a -X DELETE $B/companies/$CO)" 409

echo "Rôles & visibilité"
check "5 rôles livrés par défaut" "$(curl -s -b $TMP/a $B/roles | pick 'd=>d.length')" 5
check "commercial : portée « ses fiches » dans /auth/me" "$(curl -s -b $TMP/s $B/auth/me | pick 'd=>d.roleName+":"+d.scope')" "Commercial:OWN"
ADMIN_CONTACTS=$(curl -s -b $TMP/a "$B/contacts?pageSize=100" | pick 'd=>d.total')
SALES_ME=$(curl -s -b $TMP/s $B/auth/me | pick 'd=>d.id')
check "commercial ne liste que ses contacts" "$(curl -s -b $TMP/s "$B/contacts?pageSize=100" | pick "d=>d.items.every(c=>c.owner?.id==='$SALES_ME') && d.total<$ADMIN_CONTACTS")" true
check "commercial : fiche entreprise d'un autre -> 404" "$(code -b $TMP/s $B/companies/$CO)" 404
check "commercial ne s'attribue pas la fiche d'un autre -> 403" "$(code -b $TMP/s -X POST $B/companies -H "$J" -d "{\"name\":\"Hors portée\",\"ownerId\":\"$(curl -s -b $TMP/a $B/auth/me | pick 'd=>d.id')\"}")" 403
check "commercial ne voit pas les rôles -> 403" "$(code -b $TMP/s $B/roles)" 403
check "commercial ne crée pas d'avoir -> 403" "$(code -b $TMP/s -X POST $B/documents/$INV/credit-note)" 403
RO=$(curl -s -b $TMP/a -X POST $B/roles -H "$J" -d '{"name":"Test lecture contacts","scope":"ALL","permissions":["contacts.view","inconnu.droit"]}' | pick 'd=>d.id+":"+d.permissions.join(",")')
check "rôle personnalisé créé (droit inconnu ignoré)" "${RO#*:}" "contacts.view"
RO_ID=${RO%%:*}
TPW="Test-$(node -e "console.log(require('crypto').randomBytes(6).toString('hex'))")"
check "utilisateur créé avec ce rôle" "$(code -b $TMP/a -X POST $B/users -H "$J" -d "{\"name\":\"Lecteur\",\"email\":\"lecteur.$RANDOM@example.com\",\"roleId\":\"$RO_ID\",\"password\":\"$TPW\"}")" 201
LECT_EMAIL=$(curl -s -b $TMP/a $B/users | pick "d=>d.find(u=>u.roleId==='$RO_ID').email")
curl -s -c $TMP/r -X POST $B/auth/login -H "$J" -d "{\"email\":\"$LECT_EMAIL\",\"password\":\"$TPW\"}" >/dev/null
check "rôle lecture : voit les contacts" "$(code -b $TMP/r $B/contacts)" 200
check "rôle lecture : ne crée pas de contact -> 403" "$(code -b $TMP/r -X POST $B/contacts -H "$J" -d '{"firstName":"A","lastName":"B"}')" 403
check "rôle lecture : pas d'accès aux entreprises -> 403" "$(code -b $TMP/r $B/companies)" 403
check "rôle lecture : tableau de bord sans factures" "$(curl -s -b $TMP/r $B/dashboard | pick 'd=>d.invoices.unpaidTotal+":"+d.pipeline.openCount')" "0:0"
check "rôle lecture : pas d'export -> 403" "$(code -b $TMP/r $B/export/contacts)" 403
check "droits modifiés : effet immédiat" "$(curl -s -b $TMP/a -X PATCH $B/roles/$RO_ID -H "$J" -d '{"permissions":["contacts.view","contacts.create"]}' >/dev/null; code -b $TMP/r -X POST $B/contacts -H "$J" -d '{"firstName":"A","lastName":"Droit"}')" 201
check "rôle attribué non supprimable -> 409" "$(code -b $TMP/a -X DELETE $B/roles/$RO_ID)" 409
check "rôle Administrateur non supprimable -> 409" "$(code -b $TMP/a -X DELETE $B/roles/role_admin)" 409
check "admin garde ses droits d'administration" "$(curl -s -b $TMP/a -X PATCH $B/roles/role_admin -H "$J" -d '{"permissions":[]}' | pick 'd=>d.permissions.sort().join(",")')" "admin.roles,admin.users"
curl -s -b $TMP/a -X PATCH $B/roles/role_admin -H "$J" -d "{\"permissions\":$(curl -s -b $TMP/a $B/roles/catalog | pick 'd=>JSON.stringify(d.modules.flatMap(m=>m.actions.map(a=>a.key)))')}" >/dev/null
check "droits complets de l'admin restaurés" "$(curl -s -b $TMP/a $B/auth/me | pick 'd=>d.permissions.length')" 33
check "admin ne se retire pas son rôle -> 400" "$(code -b $TMP/a -X PATCH $B/users/$(curl -s -b $TMP/a $B/auth/me | pick 'd=>d.id') -H "$J" -d '{"roleId":"role_sales"}')" 400

exit $FAIL
