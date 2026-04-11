// MarketSpace Activity — gestione attività, inviti, soci
const Activity = (() => {
  let _sb = null;
  let _current = null; // { id, name, role }
  let _requestsSub = null;
  let _dataSub = null;

  function init(supabaseClient) {
    _sb = supabaseClient;
  }

  function getCurrent() { return _current; }
  function setCurrent(act) { _current = act; }

  // Elenco attività dell'utente
  async function listUserActivities(userId) {
    const { data, error } = await _sb
      .from("memberships")
      .select("role, joined_at, activities(id, name, created_at)")
      .eq("user_id", userId);
    if (error) throw error;
    return (data || [])
      .filter(m => m.activities)  // join può essere null se l'attività non è leggibile via RLS
      .map(m => ({
        id: m.activities.id,
        name: m.activities.name,
        role: m.role,
        joinedAt: m.joined_at,
        createdAt: m.activities.created_at
      }));
  }

  // Crea nuova attività (verifica nome unico)
  async function createActivity(name, userId) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Inserisci un nome per l'attività");

    const { data: existing } = await _sb
      .from("activities")
      .select("id")
      .ilike("name", trimmed)
      .maybeSingle();
    if (existing) throw new Error(`Il nome "${trimmed}" è già in uso`);

    const { data: act, error } = await _sb
      .from("activities")
      .insert({ name: trimmed }) // created_by impostato automaticamente via DEFAULT auth.uid()
      .select("id")
      .single();
    if (error) throw error;

    // Aggiunge il creatore come owner
    const { error: memErr } = await _sb
      .from("memberships")
      .insert({ user_id: userId, activity_id: act.id, role: "owner" });
    if (memErr) throw memErr;

    return { id: act.id, name: trimmed, role: "owner" };
  }

  // ─── INVITI ────────────────────────────────────────────────────────────────

  // Genera codice invito (valido 10 min)
  async function generateInviteCode(activityId, userId) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await _sb
      .from("invite_codes")
      .insert({ activity_id: activityId, generated_by: userId, code, expires_at: expiresAt })
      .select("code, expires_at")
      .single();
    if (error) throw error;
    return data;
  }

  // Valida codice e invia richiesta di adesione
  async function requestJoinWithCode(code, userId, username) {
    const { data: inv, error } = await _sb
      .from("invite_codes")
      .select("id, activity_id, expires_at, used, activities(name)")
      .eq("code", code.toUpperCase().trim())
      .maybeSingle();

    if (error || !inv) throw new Error("Codice non valido");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Codice scaduto (valido solo 10 minuti)");
    if (inv.used) throw new Error("Codice già utilizzato");

    // Già membro?
    const { data: alreadyMember } = await _sb
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("activity_id", inv.activity_id)
      .maybeSingle();
    if (alreadyMember) throw new Error("Sei già membro di questa attività");

    // Richiesta già in attesa?
    const { data: pending } = await _sb
      .from("join_requests")
      .select("id")
      .eq("from_user_id", userId)
      .eq("activity_id", inv.activity_id)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) throw new Error("Hai già una richiesta in attesa per questa attività");

    const { error: reqErr } = await _sb.from("join_requests").insert({
      activity_id: inv.activity_id,
      from_user_id: userId,
      from_username: username,
      invite_code_id: inv.id,
      status: "pending"
    });
    if (reqErr) throw reqErr;

    return { activityName: inv.activities.name };
  }

  // ─── RICHIESTE ─────────────────────────────────────────────────────────────

  async function listPendingRequests(activityId) {
    const { data, error } = await _sb
      .from("join_requests")
      .select("id, from_username, requested_at")
      .eq("activity_id", activityId)
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function respondToRequest(requestId, accepted, activityId) {
    const { data: req, error: fetchErr } = await _sb
      .from("join_requests")
      .select("from_user_id, invite_code_id")
      .eq("id", requestId)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await _sb
      .from("join_requests")
      .update({ status: accepted ? "accepted" : "rejected" })
      .eq("id", requestId);
    if (error) throw error;

    if (accepted) {
      const { error: memErr } = await _sb.from("memberships").insert({
        user_id: req.from_user_id,
        activity_id: activityId,
        role: "member"
      });
      if (memErr) throw memErr;

      if (req.invite_code_id) {
        await _sb.from("invite_codes").update({ used: true }).eq("id", req.invite_code_id);
      }
    }
    return true;
  }

  // ─── SOCI ──────────────────────────────────────────────────────────────────

  async function listMembers(activityId) {
    const { data, error } = await _sb
      .from("memberships")
      .select("role, joined_at, profiles(id, username)")
      .eq("activity_id", activityId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(m => ({
      userId: m.profiles.id,
      username: m.profiles.username,
      role: m.role,
      joinedAt: m.joined_at
    }));
  }

  async function removeMember(activityId, targetUserId, requestingUserId) {
    if (targetUserId === requestingUserId) throw new Error("Non puoi rimuovere te stesso");

    // Controlla che il richiedente sia owner
    const { data: me } = await _sb
      .from("memberships")
      .select("role")
      .eq("activity_id", activityId)
      .eq("user_id", requestingUserId)
      .single();
    if (!me || me.role !== "owner") throw new Error("Solo il proprietario può rimuovere i soci");

    const { error } = await _sb
      .from("memberships")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", targetUserId);
    if (error) throw error;
    return true;
  }

  // ─── REALTIME ──────────────────────────────────────────────────────────────

  // Subscribe alle richieste in arrivo (per il badge di notifica)
  function subscribeToRequests(activityId, onChange) {
    if (_requestsSub) _sb.removeChannel(_requestsSub);
    _requestsSub = _sb
      .channel("join_requests_" + activityId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "join_requests",
        filter: `activity_id=eq.${activityId}`
      }, onChange)
      .subscribe();
    return _requestsSub;
  }

  // Subscribe ai dati (movements, spools, tasks) per sync real-time tra soci
  function subscribeToData(activityId, callbacks) {
    if (_dataSub) _sb.removeChannel(_dataSub);
    const ch = _sb.channel("data_" + activityId);

    if (callbacks.movements) {
      ch.on("postgres_changes", {
        event: "*", schema: "public", table: "movements",
        filter: `activity_id=eq.${activityId}`
      }, callbacks.movements);
    }
    if (callbacks.spools) {
      ch.on("postgres_changes", {
        event: "*", schema: "public", table: "spools",
        filter: `activity_id=eq.${activityId}`
      }, callbacks.spools);
    }
    if (callbacks.tasks) {
      ch.on("postgres_changes", {
        event: "*", schema: "public", table: "tasks",
        filter: `activity_id=eq.${activityId}`
      }, callbacks.tasks);
    }

    _dataSub = ch.subscribe();
    return _dataSub;
  }

  function unsubscribeAll() {
    if (_requestsSub) { _sb.removeChannel(_requestsSub); _requestsSub = null; }
    if (_dataSub) { _sb.removeChannel(_dataSub); _dataSub = null; }
  }

  // Rinomina attività (solo il proprietario)
  async function renameActivity(activityId, newName) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Il nome non può essere vuoto");
    if (trimmed.length > 60) throw new Error("Nome troppo lungo (max 60 caratteri)");
    const { error } = await _sb
      .from("activities")
      .update({ name: trimmed })
      .eq("id", activityId);
    if (error) throw new Error(error.message);
    if (_current && _current.id === activityId) _current.name = trimmed;
    return trimmed;
  }

  return {
    init, getCurrent, setCurrent,
    listUserActivities, createActivity, renameActivity,
    generateInviteCode, requestJoinWithCode,
    listPendingRequests, respondToRequest,
    listMembers, removeMember,
    subscribeToRequests, subscribeToData, unsubscribeAll
  };
})();
