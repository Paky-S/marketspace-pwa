-- ════════════════════════════════════════════════════════════════════════════
-- MarketSpace — FIX DEFINITIVO (sostituisce tutti i fix precedenti)
-- Esegui TUTTO questo script nell'SQL Editor di Supabase → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Funzione SECURITY DEFINER (evita ricorsione infinita su memberships) ──
CREATE OR REPLACE FUNCTION get_my_activity_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT activity_id FROM memberships WHERE user_id = auth.uid()
$$;

-- ── 2. Rimuovi TUTTE le policy esistenti (pulizia completa) ─────────────────

-- profiles
DROP POLICY IF EXISTS "Own profile"            ON profiles;
DROP POLICY IF EXISTS "See member profiles"    ON profiles;

-- activities
DROP POLICY IF EXISTS "See own activities"     ON activities;
DROP POLICY IF EXISTS "Create activity"        ON activities;

-- memberships
DROP POLICY IF EXISTS "See memberships"                ON memberships;
DROP POLICY IF EXISTS "Join activity (owner + self)"   ON memberships;
DROP POLICY IF EXISTS "Insert membership"              ON memberships;
DROP POLICY IF EXISTS "Owner removes members"          ON memberships;

-- invite_codes
DROP POLICY IF EXISTS "Anyone can read invite codes"               ON invite_codes;
DROP POLICY IF EXISTS "Members can view invite codes for their activities" ON invite_codes;
DROP POLICY IF EXISTS "Members can view invite codes"              ON invite_codes;
DROP POLICY IF EXISTS "Members can create invite codes"            ON invite_codes;
DROP POLICY IF EXISTS "Members can update invite codes"            ON invite_codes;

-- join_requests
DROP POLICY IF EXISTS "Members see requests"       ON join_requests;
DROP POLICY IF EXISTS "Auth users create requests" ON join_requests;
DROP POLICY IF EXISTS "Members update requests"    ON join_requests;

-- dati
DROP POLICY IF EXISTS "Members CRUD movements" ON movements;
DROP POLICY IF EXISTS "Members CRUD tasks"     ON tasks;
DROP POLICY IF EXISTS "Members CRUD spools"    ON spools;
DROP POLICY IF EXISTS "Members CRUD app_meta"  ON app_meta;

-- ── 3. Assicura DEFAULT auth.uid() su activities.created_by ─────────────────
ALTER TABLE activities ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ── 4. Ricrea TUTTE le policy (nessuna ricorsione) ──────────────────────────

-- PROFILES
CREATE POLICY "Own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "See member profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT user_id FROM memberships
      WHERE activity_id IN (SELECT get_my_activity_ids())
    )
  );

-- ACTIVITIES
CREATE POLICY "See own activities" ON activities
  FOR SELECT USING (
    id IN (SELECT get_my_activity_ids())
  );

CREATE POLICY "Create activity" ON activities
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- MEMBERSHIPS
CREATE POLICY "See memberships" ON memberships
  FOR SELECT USING (
    activity_id IN (SELECT get_my_activity_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY "Insert membership" ON memberships
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR activity_id IN (SELECT get_my_activity_ids())
  );

CREATE POLICY "Owner removes members" ON memberships
  FOR DELETE USING (
    activity_id IN (SELECT get_my_activity_ids())
    AND activity_id IN (
      SELECT activity_id FROM memberships
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- INVITE CODES
CREATE POLICY "Anyone can read invite codes" ON invite_codes
  FOR SELECT USING (true);

CREATE POLICY "Members can create invite codes" ON invite_codes
  FOR INSERT WITH CHECK (
    activity_id IN (SELECT get_my_activity_ids())
  );

CREATE POLICY "Members can update invite codes" ON invite_codes
  FOR UPDATE USING (
    activity_id IN (SELECT get_my_activity_ids())
  );

-- JOIN REQUESTS
CREATE POLICY "Auth users create requests" ON join_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Members see requests" ON join_requests
  FOR SELECT USING (
    activity_id IN (SELECT get_my_activity_ids())
    OR from_user_id = auth.uid()
  );

CREATE POLICY "Members update requests" ON join_requests
  FOR UPDATE USING (
    activity_id IN (SELECT get_my_activity_ids())
  );

-- DATI (movements, tasks, spools, app_meta)
CREATE POLICY "Members CRUD movements" ON movements
  FOR ALL USING (activity_id IN (SELECT get_my_activity_ids()));

CREATE POLICY "Members CRUD tasks" ON tasks
  FOR ALL USING (activity_id IN (SELECT get_my_activity_ids()));

CREATE POLICY "Members CRUD spools" ON spools
  FOR ALL USING (activity_id IN (SELECT get_my_activity_ids()));

CREATE POLICY "Members CRUD app_meta" ON app_meta
  FOR ALL USING (activity_id IN (SELECT get_my_activity_ids()));

-- ── 5. Verifica finale ────────────────────────────────────────────────────
-- Questo SELECT deve restituire almeno 10 righe (una per ogni policy creata)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
