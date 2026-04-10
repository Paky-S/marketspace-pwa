-- MarketSpace — Permetti al proprietario di rinominare l'attività
-- Esegui nell'SQL Editor di Supabase

DROP POLICY IF EXISTS "Owner updates activity" ON activities;
CREATE POLICY "Owner updates activity" ON activities
  FOR UPDATE USING (
    id IN (
      SELECT activity_id FROM memberships
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
