// MarketSpace — Supabase Adapter
// Sostituisce db.js mantenendo la stessa interfaccia DB.xxx()
// Inizializzare con DB.init(supabaseClient, activityId) prima di usare

const DB = (() => {
  let _sb = null;
  let _activityId = null;

  const MATERIALS = ["PLA", "PLA+", "PETG", "ABS", "TPU", "ASA", "PC", "PP", "ALTRO"];
  const GRAM_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 3000, 5000];

  function init(supabaseClient, activityId) {
    _sb = supabaseClient;
    _activityId = activityId;
  }

  function _aid() {
    if (!_activityId) throw new Error("Nessuna attività selezionata");
    return _activityId;
  }

  // Stub per compatibilità (IndexedDB.open non serve con Supabase)
  async function open() { return true; }

  // ─── MOVEMENTS ─────────────────────────────────────────────────────────────

  function _mapMovement(row) {
    return {
      id: row.id,
      username: row.created_by_username,
      createdBy: row.created_by_username,
      type: row.type,
      amount: Number(row.amount),
      description: row.description || "",
      itemName: row.item_name || "",
      customer: row.customer || "",
      date: row.date,
      archived: !!row.archived,
      spoolId: row.spool_id || null,
      gramsUsed: Number(row.grams_used) || 0,
      materialCost: Number(row.material_cost) || 0,
      shippingCost: Number(row.shipping_cost) || 0,
      filaments: row.filaments || []
    };
  }

  async function addMovement(m) {
    const { data, error } = await _sb.from("movements").insert({
      activity_id: _aid(),
      created_by_username: m.username || "unknown",
      type: m.type || "sale",
      amount: Number(m.amount) || 0,
      description: m.description || "",
      item_name: m.itemName || "",
      customer: m.customer || "",
      date: m.date || new Date().toISOString(),
      archived: !!m.archived,
      spool_id: m.spoolId || null,
      grams_used: m.gramsUsed || 0,
      material_cost: m.materialCost || 0,
      shipping_cost: m.shippingCost || 0,
      filaments: m.filaments || []
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function listMovements(username, filter = "all", showArchived = false) {
    let q = _sb.from("movements").select("*").eq("activity_id", _aid()).order("date", { ascending: true });
    if (!showArchived) q = q.eq("archived", false);
    if (filter === "sale" || filter === "in") q = q.eq("type", "sale");
    else if (filter === "expense" || filter === "out") q = q.eq("type", "expense");
    else if (filter === "purchase") q = q.eq("type", "purchase");
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(_mapMovement);
  }

  async function getMovementStats(username, startDate = null, endDate = null) {
    let q = _sb.from("movements").select("*").eq("activity_id", _aid());
    if (startDate) q = q.gte("date", startDate.toISOString());
    if (endDate) q = q.lte("date", endDate.toISOString());
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).map(_mapMovement);

    const sales = rows.filter(m => m.type === "sale");
    const expenses = rows.filter(m => m.type === "expense");
    const purchases = rows.filter(m => m.type === "purchase");

    const totalSales = sales.reduce((s, m) => s + (m.amount || 0), 0);
    const totalExpenses = Math.abs(expenses.reduce((s, m) => s + (m.amount || 0), 0));
    const totalPurchases = purchases.reduce((s, m) => s + Math.abs(m.amount || 0), 0);
    const totalShipping = purchases.reduce((s, m) => s + (m.shippingCost || 0), 0);
    const totalMaterialCost = sales.reduce((s, m) => s + (m.materialCost || 0), 0);
    const totalGramsUsed = sales.reduce((s, m) => {
      if (m.filaments && m.filaments.length > 0)
        return s + m.filaments.reduce((a, f) => a + (f.gramsUsed || 0), 0);
      return s + (m.gramsUsed || 0);
    }, 0);

    return {
      totalSales, totalExpenses, totalPurchases, totalShipping, totalMaterialCost,
      profit: totalSales - totalMaterialCost,
      totalGramsUsed,
      totalPrints: sales.length,
      countSales: sales.length,
      countExpenses: expenses.length,
      countPurchases: purchases.length
    };
  }

  async function getMostUsedMaterial(username) {
    const rows = await listMovements(username, "all", true);
    const sales = rows.filter(m => m.type === "sale");
    const mat = {}, brand = {}, combo = {};

    for (const sale of sales) {
      if (sale.spoolId) {
        const spool = await getSpool(sale.spoolId);
        if (spool) {
          const m = spool.material || "ALTRO", b = spool.brand || "Sconosciuta";
          mat[m] = (mat[m] || 0) + 1;
          brand[b] = (brand[b] || 0) + 1;
          combo[m + "|" + b] = (combo[m + "|" + b] || 0) + 1;
        }
      }
    }

    const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0] || ["N/A", 0];
    return {
      material: { name: top(mat)[0], count: top(mat)[1] },
      brand: { name: top(brand)[0], count: top(brand)[1] },
      combo: { name: top(combo)[0], count: top(combo)[1] }
    };
  }

  async function editMovement(id, patch) {
    const dbPatch = {};
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.itemName !== undefined) dbPatch.item_name = patch.itemName;
    if (patch.customer !== undefined) dbPatch.customer = patch.customer;
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.archived !== undefined) dbPatch.archived = patch.archived;
    if (patch.filaments !== undefined) dbPatch.filaments = patch.filaments;
    if (patch.gramsUsed !== undefined) dbPatch.grams_used = patch.gramsUsed;
    if (patch.materialCost !== undefined) dbPatch.material_cost = patch.materialCost;
    const { error } = await _sb.from("movements").update(dbPatch).eq("id", id);
    if (error) throw error;
    return true;
  }

  async function deleteMovement(id) {
    const { error } = await _sb.from("movements").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  const archiveMovement = id => editMovement(id, { archived: true });
  const unarchiveMovement = id => editMovement(id, { archived: false });

  // ─── TASKS ─────────────────────────────────────────────────────────────────

  function _mapTask(row) {
    return {
      id: row.id,
      username: row.created_by_username,
      createdBy: row.created_by_username,
      description: row.description,
      done: !!row.done,
      priority: row.priority || "normal",
      archived: !!row.archived
    };
  }

  async function addTask(t) {
    const { data, error } = await _sb.from("tasks").insert({
      activity_id: _aid(),
      created_by_username: t.username || "unknown",
      description: t.description,
      done: !!t.done,
      priority: t.priority || "normal",
      archived: !!t.archived
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function listTasks(username, showArchived = false) {
    let q = _sb.from("tasks").select("*").eq("activity_id", _aid());
    if (!showArchived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) throw error;
    const pri = { "very-high": 0, "high": 1, "normal": 2, "low": 3 };
    return (data || []).map(_mapTask).sort((a, b) => {
      const d = (a.done === b.done) ? 0 : (a.done ? 1 : -1);
      const p = (pri[a.priority] ?? 2) - (pri[b.priority] ?? 2);
      return d || p || (b.id - a.id);
    });
  }

  async function toggleTask(id, done) {
    const { error } = await _sb.from("tasks").update({ done }).eq("id", id);
    if (error) throw error;
    return true;
  }

  async function editTask(id, patch) {
    const { error } = await _sb.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
    return true;
  }

  async function deleteTask(id) {
    const { error } = await _sb.from("tasks").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  const archiveTask = id => editTask(id, { archived: true });
  const unarchiveTask = id => editTask(id, { archived: false });

  // ─── SPOOLS ────────────────────────────────────────────────────────────────

  function _mapSpool(row) {
    return {
      id: row.id,
      name: row.name,
      material: row.material,
      brand: row.brand,
      color: row.color,
      grams_total: Number(row.grams_total),
      grams_available: Number(row.grams_available),
      price_per_kg: Number(row.price_per_kg),
      archived: !!row.archived
    };
  }

  async function addSpool(s) {
    const { data, error } = await _sb.from("spools").insert({
      activity_id: _aid(),
      name: s.name || "Bobina",
      material: s.material || "PLA",
      brand: s.brand || "",
      color: s.color || "#888888",
      grams_total: Number(s.grams_total) || 1000,
      grams_available: Number(s.grams_available) || 1000,
      price_per_kg: Number(s.price_per_kg) || 20,
      archived: !!s.archived
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function addMultipleSpools(spoolsData, shippingCost = 0) {
    const results = [];
    const shippingPerSpool = spoolsData.length > 0 ? shippingCost / spoolsData.length : 0;
    for (const d of spoolsData) {
      const costPerKg = Math.round(((Number(d.cost) + shippingPerSpool) / (Number(d.grams) / 1000)) * 100) / 100;
      const id = await addSpool({
        name: d.material + " " + d.colorName,
        material: d.material,
        brand: d.brand,
        color: d.color,
        grams_total: Number(d.grams),
        grams_available: Number(d.grams),
        price_per_kg: costPerKg,
        archived: false
      });
      results.push(id);
    }
    return results;
  }

  async function listSpools(includeArchived = false) {
    let q = _sb.from("spools").select("*").eq("activity_id", _aid());
    if (!includeArchived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(_mapSpool);
  }

  async function getSpoolStats() {
    const spools = await listSpools(true);
    const totalGrams = spools.reduce((s, x) => s + (x.grams_available || 0), 0);
    const totalValue = spools.reduce((s, x) => s + ((x.grams_available || 0) / 1000 * x.price_per_kg), 0);
    const byMaterial = {};
    for (const sp of spools) {
      const m = sp.material || "ALTRO";
      byMaterial[m] = (byMaterial[m] || 0) + 1;
    }
    const mostMaterial = Object.entries(byMaterial).sort((a, b) => b[1] - a[1])[0] || ["N/A", 0];
    return {
      totalSpools: spools.length, totalGrams, totalValue,
      mostMaterial: { name: mostMaterial[0], count: mostMaterial[1] },
      byMaterial
    };
  }

  async function getSpool(id) {
    const { data, error } = await _sb.from("spools").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return _mapSpool(data);
  }

  async function editSpool(id, patch) {
    const { error } = await _sb.from("spools").update(patch).eq("id", id);
    if (error) throw error;
    return true;
  }

  async function consumeSpool(id, grams) {
    const row = await getSpool(id);
    if (!row) return false;
    if (Number(row.grams_available) < Number(grams)) throw new Error("insufficient");
    const newGrams = Number(row.grams_available) - Number(grams);
    await editSpool(id, { grams_available: newGrams });
    if (newGrams <= 0) await archiveSpool(id);
    return true;
  }

  const archiveSpool = id => editSpool(id, { archived: true });
  const unarchiveSpool = id => editSpool(id, { archived: false });
  const addSpoolStock = (id, grams) => getSpool(id).then(s => s && editSpool(id, { grams_available: (s.grams_available || 0) + Number(grams) }));

  // ─── META ──────────────────────────────────────────────────────────────────

  async function setMeta(key, value) {
    const { error } = await _sb.from("app_meta").upsert({ activity_id: _aid(), key, value });
    if (error) throw error;
    return true;
  }

  async function getMeta(key) {
    const { data, error } = await _sb.from("app_meta").select("value").eq("activity_id", _aid()).eq("key", key).maybeSingle();
    if (error || !data) return undefined;
    return data.value;
  }

  // ─── EXPORT / IMPORT ───────────────────────────────────────────────────────

  async function exportAll(username) {
    const [movs, tasks, spools] = await Promise.all([
      listMovements(username, "all", true),
      listTasks(username, true),
      listSpools(true)
    ]);
    const payload = { version: "5", username, exportedAt: new Date().toISOString(), movements: movs, tasks, spools };
    const checksum = await _sha256(JSON.stringify(payload));
    return { meta: { checksum }, payload };
  }

  async function importAll(username, obj) {
    if (!obj || !obj.meta || !obj.payload) return false;
    const raw = JSON.stringify(obj.payload);
    if ((await _sha256(raw)) !== obj.meta.checksum) return false;
    await clearAll();
    const actId = _aid();
    for (const m of (obj.payload.movements || [])) {
      await _sb.from("movements").insert({
        activity_id: actId, created_by_username: m.username || m.createdBy || "import",
        type: m.type || "sale", amount: Number(m.amount) || 0,
        description: m.description || "", item_name: m.itemName || "",
        customer: m.customer || "", date: m.date || new Date().toISOString(),
        archived: !!m.archived, spool_id: m.spoolId || null,
        grams_used: m.gramsUsed || 0, material_cost: m.materialCost || 0,
        shipping_cost: m.shippingCost || 0, filaments: m.filaments || []
      });
    }
    for (const t of (obj.payload.tasks || [])) {
      await _sb.from("tasks").insert({
        activity_id: actId, created_by_username: t.username || "import",
        description: t.description, done: !!t.done,
        priority: t.priority || "normal", archived: !!t.archived
      });
    }
    for (const s of (obj.payload.spools || [])) {
      await _sb.from("spools").insert({
        activity_id: actId, name: s.name || "Bobina",
        material: s.material || "PLA", brand: s.brand || "",
        color: s.color || "#888888", grams_total: Number(s.grams_total) || 1000,
        grams_available: Number(s.grams_available) || 1000,
        price_per_kg: Number(s.price_per_kg) || 20, archived: !!s.archived
      });
    }
    return true;
  }

  async function clearAll() {
    const actId = _aid();
    await Promise.all([
      _sb.from("movements").delete().eq("activity_id", actId),
      _sb.from("tasks").delete().eq("activity_id", actId),
      _sb.from("spools").delete().eq("activity_id", actId)
    ]);
  }

  async function _sha256(text) {
    const enc = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  return {
    init, open, MATERIALS, GRAM_OPTIONS,
    addMovement, listMovements, getMovementStats, getMostUsedMaterial,
    editMovement, deleteMovement, archiveMovement, unarchiveMovement,
    addTask, listTasks, toggleTask, editTask, deleteTask, archiveTask, unarchiveTask,
    addSpool, addMultipleSpools, listSpools, getSpoolStats, getSpool,
    addSpoolStock, consumeSpool, editSpool, archiveSpool, unarchiveSpool,
    setMeta, getMeta, exportAll, importAll, clearAll
  };
})();
