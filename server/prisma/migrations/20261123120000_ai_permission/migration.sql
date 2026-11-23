-- Nouveau droit « ai.use » (assistant IA) ajouté aux rôles livrés par défaut.
-- Les rôles créés par l'administrateur ne sont pas modifiés : il décide lui-même.
UPDATE "AppRole"
SET "permissions" = array_append("permissions", 'ai.use'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('role_admin', 'role_manager', 'role_sales', 'role_accountant', 'role_readonly')
  AND NOT ('ai.use' = ANY("permissions"));
