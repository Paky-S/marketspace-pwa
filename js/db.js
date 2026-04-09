// IndexedDB wrapper
const DB = (()=>{
  const DB_NAME = "marketspace-db";
  const DB_VERSION = 4;
  let _db;

  const MATERIALS = ["PLA", "PLA+", "PETG", "ABS", "TPU", "ASA", "PC", "PP", "ALTRO"];
  const GRAM_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 3000, 5000];

  function open(){
    return new Promise((res,rej)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev)=>{
        const db = ev.target.result;
        
        // Movements - Aggiornato v4
        if (!db.objectStoreNames.contains("movements")){
          const st = db.createObjectStore("movements",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_user","username",{unique:false});
          st.createIndex("by_date","date",{unique:false});
          st.createIndex("by_archived","archived",{unique:false});
          st.createIndex("by_type","type",{unique:false});
        } else if (ev.oldVersion < 4) {
          // Migrazione da versione precedente
          const st = req.transaction.objectStore("movements");
          if (!st.indexNames.contains("by_type")) {
            st.createIndex("by_type","type",{unique:false});
          }
        }
        
        // Tasks
        if (!db.objectStoreNames.contains("tasks")){
          const st = db.createObjectStore("tasks",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_user","username",{unique:false});
          st.createIndex("by_archived","archived",{unique:false});
          st.createIndex("by_done","done",{unique:false});
        }
        
        // Spools - Aggiornato v4
        if (!db.objectStoreNames.contains("spools")){
          const st = db.createObjectStore("spools",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_archived","archived",{unique:false});
          st.createIndex("by_name","name",{unique:false});
          st.createIndex("by_material","material",{unique:false});
          st.createIndex("by_brand","brand",{unique:false});
        } else if (ev.oldVersion < 4) {
          const st = req.transaction.objectStore("spools");
          if (!st.indexNames.contains("by_material")) {
            st.createIndex("by_material","material",{unique:false});
          }
          if (!st.indexNames.contains("by_brand")) {
            st.createIndex("by_brand","brand",{unique:false});
          }
        }
        
        // Meta
        if (!db.objectStoreNames.contains("meta")){
          db.createObjectStore("meta",{keyPath:"key"});
        }
      };
      req.onsuccess = ()=>{
        _db=req.result;
        _postOpenMigrations().then(res).catch(err=>{ console.warn("migrations:", err); res(); });
      };
      req.onerror = ()=>rej(req.error);
    });
  }

  async function _postOpenMigrations(){
    const migrated = await getMeta("migrated_v4");
    if (migrated) return;
    
    // Migra movements: aggiungi type='sale' ai record senza type
    await _ensureTypeDefault("movements");
    // Migra spools: aggiungi campi mancanti
    await _ensureSpoolDefaults();
    
    await setMeta("migrated_v4", true);
  }
  
  function _ensureTypeDefault(store){
    return new Promise((res,rej)=>{
      const [tx,st]=_tx(store,"readwrite");
      const cur = st.openCursor();
      cur.onsuccess = ()=>{
        const c = cur.result;
        if (!c){ res(); return; }
        const v = c.value;
        if (!v.type) {
          v.type = v.amount >= 0 ? 'sale' : 'expense';
          v.customer = v.customer || '';
          c.update(v);
        }
        cur.result.continue();
      };
      cur.onerror = ()=>rej(cur.error);
    });
  }
  
  function _ensureSpoolDefaults(){
    return new Promise((res,rej)=>{
      const [tx,st]=_tx("spools","readwrite");
      const cur = st.openCursor();
      cur.onsuccess = ()=>{
        const c = cur.result;
        if (!c){ res(); return; }
        const v = c.value;
        let updated = false;
        if (!v.material) { v.material = "PLA"; updated = true; }
        if (!v.brand) { v.brand = ""; updated = true; }
        if (!v.color) { v.color = "#888888"; updated = true; }
        if (!v.grams_total) { v.grams_total = v.grams_available || 1000; updated = true; }
        if (updated) c.update(v);
        cur.result.continue();
      };
      cur.onerror = ()=>rej(cur.error);
    });
  }

  function _tx(store,mode="readonly"){ const tx=_db.transaction(store,mode); return [tx,tx.objectStore(store)]; }
  function _put(store,obj){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); const r=st.add(obj); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  function _get(store,id){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readonly"); const r=st.get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  function _patch(store,id,patch){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); const r=st.get(id);
    r.onsuccess=()=>{ let row=r.result; if(!row) return res(false); const delta=(typeof patch==="function")?patch(row):patch; Object.assign(row,delta); const p=st.put(row); p.onsuccess=()=>res(true); p.onerror=()=>rej(p.error); }; r.onerror=()=>rej(r.error); }); }
  function _del(store,id){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); const r=st.delete(id); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); }); }
  const _setFlag = (store,id,flags)=>_patch(store,id,flags);

  // Movements - Con tipo e cliente
  function addMovement(m){
    const movement = {
      username: m.username,
      type: m.type || 'sale',
      amount: Number(m.amount) || 0,
      description: m.description || '',
      itemName: m.itemName || '',
      customer: m.customer || '',
      date: m.date || new Date().toISOString(),
      archived: !!m.archived,
      spoolId: m.spoolId || null,
      gramsUsed: m.gramsUsed || 0,
      materialCost: m.materialCost || 0,
      shippingCost: m.shippingCost || 0,
      filaments: m.filaments || []
    };
    return _put("movements", movement);
  }
  
  function listMovements(username, filter="all", showArchived=false){
    return new Promise((res,rej)=>{
      const [tx,st]=_tx("movements","readonly");
      const idx=st.index("by_user"); const r=idx.getAll(IDBKeyRange.only(username));
      r.onsuccess=()=>{ 
        let rows=(r.result||[]).filter(x=>showArchived?true:!x.archived);
        if (filter==="in" || filter==="sale") rows=rows.filter(x=>x.type==='sale' || x.amount>=0);
        if (filter==="out" || filter==="expense") rows=rows.filter(x=>x.type==='expense' || x.amount<0);
        if (filter==="purchase") rows=rows.filter(x=>x.type==='purchase');
        rows.sort((a,b)=>new Date(a.date)-new Date(b.date)); res(rows); 
      };
      r.onerror=()=>rej(r.error);
    });
  }
  
  // Statistiche movements
  async function getMovementStats(username, startDate=null, endDate=null){
    const rows = await listMovements(username, "all", true);
    let filtered = rows;
    
    if (startDate || endDate) {
      filtered = rows.filter(m => {
        const d = new Date(m.date);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });
    }
    
    const sales = filtered.filter(m => m.type === 'sale' || m.amount > 0);
    const expenses = filtered.filter(m => m.type === 'expense' || m.amount < 0);
    const purchases = filtered.filter(m => m.type === 'purchase');
    
    const totalSales = sales.reduce((sum, m) => sum + (m.amount || 0), 0);
    const totalExpenses = Math.abs(expenses.reduce((sum, m) => sum + (m.amount || 0), 0));
    const totalPurchases = purchases.reduce((sum, m) => sum + Math.abs(m.amount || 0), 0);
    const totalShipping = purchases.reduce((sum, m) => sum + (m.shippingCost || 0), 0);
    const totalMaterialCost = sales.reduce((sum, m) => sum + (m.materialCost || 0), 0);
    
    const totalGramsUsed = sales.reduce((sum, m) => {
      if (m.filaments && m.filaments.length > 0)
        return sum + m.filaments.reduce((s, f) => s + (f.gramsUsed || 0), 0);
      return sum + (m.gramsUsed || 0);
    }, 0);
    const totalPrints = sales.length;
    
    return {
      totalSales,
      totalExpenses,
      totalPurchases,
      totalShipping,
      totalMaterialCost,
      profit: totalSales - totalMaterialCost,
      totalGramsUsed,
      totalPrints,
      countSales: sales.length,
      countExpenses: expenses.length,
      countPurchases: purchases.length
    };
  }
  
  // Materiale e marca più usati
  async function getMostUsedMaterial(username){
    const rows = await listMovements(username, "all", true);
    const sales = rows.filter(m => m.type === 'sale' || m.amount > 0);
    
    const materialCount = {};
    const brandCount = {};
    const materialBrandCount = {};
    
    for (const sale of sales) {
      if (sale.spoolId) {
        const spool = await getSpool(sale.spoolId);
        if (spool) {
          const mat = spool.material || "ALTRO";
          const brand = spool.brand || "Sconosciuta";
          const matBrand = mat + "|" + brand;
          
          materialCount[mat] = (materialCount[mat] || 0) + 1;
          brandCount[brand] = (brandCount[brand] || 0) + 1;
          materialBrandCount[matBrand] = (materialBrandCount[matBrand] || 0) + 1;
        }
      }
    }
    
    const mostUsedMaterial = Object.entries(materialCount).sort((a,b) => b[1] - a[1])[0] || ["N/A", 0];
    const mostUsedBrand = Object.entries(brandCount).sort((a,b) => b[1] - a[1])[0] || ["N/A", 0];
    const mostUsedCombo = Object.entries(materialBrandCount).sort((a,b) => b[1] - a[1])[0] || ["N/A", 0];
    
    return {
      material: { name: mostUsedMaterial[0], count: mostUsedMaterial[1] },
      brand: { name: mostUsedBrand[0], count: mostUsedBrand[1] },
      combo: { name: mostUsedCombo[0], count: mostUsedCombo[1] }
    };
  }
  
  const editMovement = (id,patch)=>_patch("movements",id,patch);
  const deleteMovement = (id)=>_del("movements",id);
  const archiveMovement = (id)=>_setFlag("movements",id,{archived:true});
  const unarchiveMovement = (id)=>_setFlag("movements",id,{archived:false});

  // Tasks
  const addTask = (t)=>_put("tasks", {...t, archived: !!t.archived});
  function listTasks(username, showArchived=false){
    return new Promise((res,rej)=>{
      const [tx,st]=_tx("tasks","readonly");
      const idx=st.index("by_user"); const r=idx.getAll(IDBKeyRange.only(username));
      r.onsuccess=()=>{ const rows=(r.result||[]).filter(x=>showArchived?true:!x.archived).sort((a,b)=>{
        const pri={"very-high":0,"high":1,"normal":2,"low":3};
        const d1=(a.done===b.done)?0:(a.done?1:-1);
        const p1=(pri[a.priority]??2)-(pri[b.priority]??2);
        const idd=(b.id??0)-(a.id??0);
        return d1||p1||idd;
      }); res(rows); };
      r.onerror=()=>rej(r.error);
    });
  }
  const toggleTask = (id,done)=>_patch("tasks",id,{done});
  const editTask   = (id,patch)=>_patch("tasks",id,patch);
  const deleteTask = (id)=>_del("tasks",id);
  const archiveTask = (id)=>_setFlag("tasks",id,{archived:true});
  const unarchiveTask = (id)=>_setFlag("tasks",id,{archived:false});

  // Spools - Con materiale, marca, colore
  function addSpool(s){
    return _put("spools",{
      name: s.name || "Bobina",
      material: s.material || "PLA",
      brand: s.brand || "",
      color: s.color || "#888888",
      grams_total: Number(s.grams_total) || Number(s.grams_available) || 1000,
      grams_available: Number(s.grams_available) || Number(s.grams_total) || 1000,
      price_per_kg: Number(s.price_per_kg) || 20,
      archived: !!s.archived
    });
  }
  
  // Aggiungi più bobine da acquisto
  async function addMultipleSpools(spoolsData, shippingCost=0){
    const results = [];
    const shippingPerSpool = spoolsData.length > 0 ? shippingCost / spoolsData.length : 0;
    
    for (const data of spoolsData) {
      const costPerKg = Math.round(((Number(data.cost) + shippingPerSpool) / (Number(data.grams) / 1000)) * 100) / 100;
      const id = await addSpool({
        name: data.material + " " + data.colorName,
        material: data.material,
        brand: data.brand,
        color: data.color,
        grams_total: Number(data.grams),
        grams_available: Number(data.grams),
        price_per_kg: costPerKg,
        archived: false
      });
      results.push(id);
    }
    return results;
  }
  
  function listSpools(includeArchived=false){
    return new Promise((res,rej)=>{ 
      const [tx,st]=_tx("spools","readonly"); const r=st.getAll(); 
      r.onsuccess=()=>{ const rows=r.result||[]; res(includeArchived?rows:rows.filter(x=>!x.archived)); }; 
      r.onerror=()=>rej(r.error); 
    });
  }
  
  // Statistiche magazzino
  async function getSpoolStats(){
    const spools = await listSpools(true);
    const totalSpools = spools.length;
    const totalGrams = spools.reduce((sum, s) => sum + (s.grams_available || 0), 0);
    const totalValue = spools.reduce((sum, s) => sum + ((s.grams_available || 0) / 1000 * s.price_per_kg), 0);
    
    const byMaterial = {};
    for (const s of spools) {
      const mat = s.material || "ALTRO";
      byMaterial[mat] = (byMaterial[mat] || 0) + 1;
    }
    const mostMaterial = Object.entries(byMaterial).sort((a,b) => b[1] - a[1])[0] || ["N/A", 0];
    
    return {
      totalSpools,
      totalGrams,
      totalValue,
      mostMaterial: { name: mostMaterial[0], count: mostMaterial[1] },
      byMaterial
    };
  }
  
  const getSpool = (id)=>_get("spools",id);
  const addSpoolStock = (id,grams)=>_patch("spools",id,row=>({grams_available:Number(row.grams_available||0)+Number(grams||0)}));
  async function consumeSpool(id,grams){ const row=await getSpool(id); if(!row) return false; if(Number(row.grams_available)<Number(grams)) throw new Error("insufficient"); return _patch("spools",id,{grams_available:Number(row.grams_available)-Number(grams)}); }
  const editSpool = (id,patch)=>_patch("spools",id,patch);
  const archiveSpool = (id)=>_setFlag("spools",id,{archived:true});
  const unarchiveSpool = (id)=>_setFlag("spools",id,{archived:false});

  // Meta
  function setMeta(key,value){ return new Promise((res,rej)=>{ const [tx,st]=_tx("meta","readwrite"); const r=st.put({key,value}); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); }); }
  function getMeta(key){ return new Promise((res,rej)=>{ const [tx,st]=_tx("meta","readonly"); const r=st.get(key); r.onsuccess=()=>res(r.result?.value); r.onerror=()=>rej(r.error); }); }

  // Export/Import
  async function exportAll(username){
    const [movs,tasks,spools] = await Promise.all([listMovements(username,"all",true), listTasks(username,true), listSpools(true)]);
    const payload = {version:"4", username, exportedAt:new Date().toISOString(), movements:movs, tasks, spools};
    const checksum = await sha256(JSON.stringify(payload));
    return {meta:{checksum}, payload};
  }
  async function importAll(username,obj){
    if(!obj||!obj.meta||!obj.payload) return false;
    const raw = JSON.stringify(obj.payload);
    if ((await sha256(raw)) !== obj.meta.checksum) return false;
    await clearAll();
    await _batchPut("movements",(obj.payload.movements||[]).map(m=>({...m, username, archived:!!m.archived})));
    await _batchPut("tasks",(obj.payload.tasks||[]).map(t=>({...t, username, archived:!!t.archived})));
    await _batchPut("spools",(obj.payload.spools||[]));
    return true;
  }
  function _batchPut(store,rows){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); rows.forEach(r=>st.put(r)); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  function _clearUser(username){ return new Promise((res,rej)=>{ const tx=_db.transaction(["movements","tasks"],"readwrite"); const stM=tx.objectStore("movements"); const stT=tx.objectStore("tasks");
    const rM=stM.index("by_user").getAllKeys(IDBKeyRange.only(username)); const rT=stT.index("by_user").getAllKeys(IDBKeyRange.only(username));
    tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);
    rM.onsuccess=()=>{ rM.result.forEach(k=>stM.delete(k)); };
    rT.onsuccess=()=>{ rT.result.forEach(k=>stT.delete(k)); };
  }); }
  function clearAll(){ return new Promise((res,rej)=>{ const tx=_db.transaction(["movements","tasks","spools"],"readwrite"); tx.objectStore("movements").clear(); tx.objectStore("tasks").clear(); tx.objectStore("spools").clear(); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function sha256(text){ const enc=new TextEncoder().encode(text); const hash = await crypto.subtle.digest("SHA-256", enc); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join(""); }

  return {
    open, MATERIALS, GRAM_OPTIONS,
    addMovement, listMovements, getMovementStats, getMostUsedMaterial,
    editMovement, deleteMovement, archiveMovement, unarchiveMovement,
    addTask, listTasks, toggleTask, editTask, deleteTask, archiveTask, unarchiveTask,
    addSpool, addMultipleSpools, listSpools, getSpoolStats, getSpool, addSpoolStock, consumeSpool, editSpool, archiveSpool, unarchiveSpool,
    setMeta, getMeta, exportAll, importAll, clearAll
  };
})();
