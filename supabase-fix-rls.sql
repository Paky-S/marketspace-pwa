-- MarketSpace — Fix RLS ricorsione infinita su memberships
-- Incolla nell'SQL Editor di Supabase e clicca Run

-- 1. Funzione security definer (evita la ricorsione)
--    Eseguita come owner del DB, non subisce RLS
CREATE OR REPLACE FUNCTION get_my_activity_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT activity_id FROM memberships WHERE user_id = auth.uid()
$$;

-- 2. Elimina le vecchie policy ricorsive
DROP POLICY IF EXISTS "See memberships" ON memberships;
DROP POLICY IF EXISTS "Join activity (owner + self)" ON memberships;
DROP POLICY IF EXISTS "Owner removes members" ON memberships;
DROP POLICY IF EXISTS "See own activities" ON activities;
DROP POLICY IF EXISTS "See member profiles" ON profiles;
DROP POLICY IF EXISTS "Members can view invite codes for their activities" ON invite_codes;
DROP POLICY IF EXISTS "Members can create invite codes" ON invite_codes;
DROP POLICY IF EXISTS "Members can update invite codes" ON invite_codes;
DROP POLICY IF EXISTS "Members see requests" ON join_requests;
DROP POLICY IF EXISTS "Members update requests" ON join_requests;
DROP POLICY IF EXISTS "Members CRUD movements" ON movements;
DROP POLICY IF EXISTS "Members CRUD tasks" ON tasks;
DROP POLICY IF EXISTS "Members CRUD spools" ON spools;
DROP POLICY IF EXISTS "Members CRUD app_meta" ON app_meta;

-- 3. Ricrea le policy usando la funzione (niente ricorsione)

-- Memberships: ogni utente vede le membership delle proprie attività
CREATE POLICY "See memberships" ON memberships FOR SELECT USING (
  activity_id IN (SELECT get_my_activity_ids())
  OR user_id = auth.uid()
);
CREATE POLICY "Insert membership" ON memberships FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Owner removes members" ON memberships FOR DELETE USING (
  activity_id IN (
    SELECT activity_id FROM memberships
    WHERE user_id = auth.uid() AND role = 'owner'
    AND activity_id IN (SELECT get_my_activity_ids())
  )
);

-- Activities
CREATE POLICY "See own activities" ON activities FOR SELECT USING (
  id IN (SELECT get_my_activity_ids())
);

-- Profiles: vedi i profili dei tuoi colleghi
CREATE POLICY "See member profiles" ON profiles FOR SELECT USING (
  id IN (
    SELECT user_id FROM memberships
    WHERE activity_id IN (SELECT get_my_activity_ids())
  )
);

-- Invite codes
CREATE POLICY "Members can view invite codes" ON invite_codes FOR SELECT USING (
  activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Members can create invite codes" ON invite_codes FOR INSERT WITH CHECK (
  activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Members can update invite codes" ON invite_codes FOR UPDATE USING (
  activity_id IN (SELECT get_my_activity_ids())
);

-- Join requests
CREATE POLICY "Members see requests" ON join_requests FOR SELECT USING (
  activity_id IN (SELECT get_my_activity_ids())
  OR from_user_id = auth.uid()
);
CREATE POLICY "Members update requests" ON join_requests FOR UPDATE USING (
  activity_id IN (SELECT get_my_activity_ids())
);

-- Dati
CREATE POLICY "Members CRUD movements" ON movements FOR ALL USING (
  activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Members CRUD tasks" ON tasks FOR ALL USING (
  activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Members CRUD spools" ON spools FOR ALL USING (
  activity_id IN (SELECT get_my_activity_ids())
);
CREATE POLICY "Members CRUD app_meta" ON app_meta FOR ALL USING (
  activity_id IN (SELECT get_my_activity_ids())
);
