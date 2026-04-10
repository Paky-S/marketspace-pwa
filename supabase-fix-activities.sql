-- Fix: created_by impostato automaticamente dal server tramite auth.uid()

-- Imposta il default su activities.created_by
ALTER TABLE activities ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Imposta il default su memberships.user_id (per l'insert del creatore)
-- Non necessario, viene passato esplicitamente

-- Aggiorna la policy INSERT su activities per permettere insert autenticati
DROP POLICY IF EXISTS "Create activity" ON activities;
CREATE POLICY "Create activity" ON activities
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Aggiorna la policy INSERT su memberships
DROP POLICY IF EXISTS "Insert membership" ON memberships;
CREATE POLICY "Insert membership" ON memberships
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR activity_id IN (SELECT get_my_activity_ids())
  );
