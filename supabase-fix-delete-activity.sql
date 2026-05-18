-- MarketSpace v2.1.0 — Funzione RPC per eliminazione attività in cascata
-- Eseguire nel SQL Editor di Supabase (una sola volta)

CREATE OR REPLACE FUNCTION delete_activity(p_activity_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Verifica che il chiamante sia il proprietario
  SELECT role INTO v_role
  FROM memberships
  WHERE activity_id = p_activity_id AND user_id = auth.uid();

  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo il proprietario può eliminare l''attività';
  END IF;

  -- Elimina dati in cascata
  DELETE FROM movements     WHERE activity_id = p_activity_id;
  DELETE FROM spools        WHERE activity_id = p_activity_id;
  DELETE FROM tasks         WHERE activity_id = p_activity_id;
  DELETE FROM invite_codes  WHERE activity_id = p_activity_id;
  DELETE FROM join_requests WHERE activity_id = p_activity_id;
  DELETE FROM memberships   WHERE activity_id = p_activity_id;
  DELETE FROM activities    WHERE id = p_activity_id;
END;
$$;

-- Permetti agli utenti autenticati di chiamare questa funzione
GRANT EXECUTE ON FUNCTION delete_activity(UUID) TO authenticated;
