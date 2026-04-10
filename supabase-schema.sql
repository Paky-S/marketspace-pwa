-- MarketSpace v2.0 — Schema Supabase
-- Incolla questo script nell'editor SQL di Supabase (una sola volta)

-- ─── TABELLE ────────────────────────────────────────────────────────────────

-- Profili utente (collegati a auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attività (aziende / business)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memberships (chi appartiene a quale attività)
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, activity_id)
);

-- Codici invito (scadono dopo 10 minuti)
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES profiles(id),
  code TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Richieste di adesione
CREATE TABLE join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  from_username TEXT NOT NULL,
  invite_code_id UUID REFERENCES invite_codes(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movimenti finanziari
CREATE TABLE movements (
  id BIGSERIAL PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  created_by_username TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'sale',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  item_name TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE,
  spool_id BIGINT,
  grams_used NUMERIC DEFAULT 0,
  material_cost NUMERIC DEFAULT 0,
  shipping_cost NUMERIC DEFAULT 0,
  filaments JSONB DEFAULT '[]'
);

-- Task / To-Do
CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  created_by_username TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'normal',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bobine (magazzino filamento)
CREATE TABLE spools (
  id BIGSERIAL PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT 'Bobina',
  material TEXT DEFAULT 'PLA',
  brand TEXT DEFAULT '',
  color TEXT DEFAULT '#888888',
  grams_total NUMERIC DEFAULT 1000,
  grams_available NUMERIC DEFAULT 1000,
  price_per_kg NUMERIC DEFAULT 20,
  archived BOOLEAN DEFAULT FALSE
);

-- Metadati app (tema, palette ecc.) — per attività
CREATE TABLE app_meta (
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  PRIMARY KEY (activity_id, key)
);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE spools ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

-- Profili
CREATE POLICY "Own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "See member profiles" ON profiles FOR SELECT USING (
  id IN (
    SELECT m2.user_id FROM memberships m2
    WHERE m2.activity_id IN (
      SELECT m.activity_id FROM memberships m WHERE m.user_id = auth.uid()
    )
  )
);

-- Attività
CREATE POLICY "See own activities" ON activities FOR SELECT USING (
  id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Create activity" ON activities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Memberships
CREATE POLICY "See memberships" ON memberships FOR SELECT USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Join activity (owner + self)" ON memberships FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid() AND role = 'owner')
);
CREATE POLICY "Owner removes members" ON memberships FOR DELETE USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid() AND role = 'owner')
);

-- Codici invito
CREATE POLICY "Anyone can read invite codes" ON invite_codes FOR SELECT USING (true);
CREATE POLICY "Members can create invite codes" ON invite_codes FOR INSERT WITH CHECK (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Members can update invite codes" ON invite_codes FOR UPDATE USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);

-- Richieste
CREATE POLICY "Members see requests" ON join_requests FOR SELECT USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
  OR from_user_id = auth.uid()
);
CREATE POLICY "Auth users create requests" ON join_requests FOR INSERT WITH CHECK (
  auth.uid() = from_user_id
);
CREATE POLICY "Members update requests" ON join_requests FOR UPDATE USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);

-- Dati (movements, tasks, spools, app_meta)
CREATE POLICY "Members CRUD movements" ON movements FOR ALL USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Members CRUD tasks" ON tasks FOR ALL USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Members CRUD spools" ON spools FOR ALL USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);
CREATE POLICY "Members CRUD app_meta" ON app_meta FOR ALL USING (
  activity_id IN (SELECT activity_id FROM memberships WHERE user_id = auth.uid())
);

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- Abilita realtime su queste tabelle (vai anche in Supabase > Database > Replication
-- e aggiungi movements, spools, tasks, join_requests)

ALTER PUBLICATION supabase_realtime ADD TABLE movements;
ALTER PUBLICATION supabase_realtime ADD TABLE spools;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE join_requests;
