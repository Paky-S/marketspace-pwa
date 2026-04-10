// MarketSpace Auth — login/registrazione con username+password via Supabase
const Auth = (() => {
  const EMAIL_SUFFIX = "@marketspace.local";
  let _sb = null;
  let _currentUser = null; // { id, username }

  function init(supabaseClient) {
    _sb = supabaseClient;
  }

  function _toEmail(username) {
    return username.toLowerCase().trim() + EMAIL_SUFFIX;
  }

  function getCurrentUser() {
    return _currentUser;
  }

  // Recupera sessione esistente all'avvio
  async function getSession() {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return null;
    const { data: profile } = await _sb
      .from("profiles")
      .select("username")
      .eq("id", session.user.id)
      .single();
    if (!profile) { await _sb.auth.signOut(); return null; }
    _currentUser = { id: session.user.id, username: profile.username };
    return _currentUser;
  }

  // Registrazione nuovo utente
  async function register(username, password) {
    const uname = username.toLowerCase().trim();
    if (!uname || uname.length < 3) throw new Error("Username troppo corto (min. 3 caratteri)");
    if (password.length < 6) throw new Error("Password troppo corta (min. 6 caratteri)");

    // Controlla disponibilità username
    const { data: existing } = await _sb
      .from("profiles")
      .select("id")
      .eq("username", uname)
      .maybeSingle();
    if (existing) throw new Error("Username già in uso, scegline un altro");

    const { data, error } = await _sb.auth.signUp({
      email: _toEmail(uname),
      password,
      options: { emailRedirectTo: null }
    });
    if (error) throw new Error("Errore registrazione: " + error.message);
    if (!data.user) throw new Error("Registrazione fallita, riprova");

    // Crea profilo
    const { error: profileErr } = await _sb
      .from("profiles")
      .insert({ id: data.user.id, username: uname });
    if (profileErr) throw new Error("Errore creazione profilo: " + profileErr.message);

    _currentUser = { id: data.user.id, username: uname };
    return _currentUser;
  }

  // Login utente esistente
  async function login(username, password) {
    const uname = username.toLowerCase().trim();
    const { data, error } = await _sb.auth.signInWithPassword({
      email: _toEmail(uname),
      password
    });
    if (error) throw new Error("Username o password errati");

    const { data: profile } = await _sb
      .from("profiles")
      .select("username")
      .eq("id", data.user.id)
      .single();

    _currentUser = { id: data.user.id, username: profile?.username || uname };
    return _currentUser;
  }

  // Logout
  async function logout() {
    await _sb.auth.signOut();
    _currentUser = null;
  }

  return { init, getCurrentUser, getSession, register, login, logout };
})();
