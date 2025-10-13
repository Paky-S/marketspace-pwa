// IndexedDB wrapper
const DB = (()=>{
  const DB_NAME = "marketspace-db";
  const DB_VERSION = 3;
  let _db;

  function open(){
    return new Promise((res,rej)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev)=>{
        const db = ev.target.result;
        if (!db.objectStoreNames.contains("movements")){
          const st = db.createObjectStore("movements",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_user","username",{unique:false});
          st.createIndex("by_date","date",{unique:false});
          st.createIndex("by_archived","archived",{unique:false});
        }
        if (!db.objectStoreNames.contains("tasks")){
          const st = db.createObjectStore("tasks",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_user","username",{unique:false});
          st.createIndex("by_archived","archived",{unique:false});
          st.createIndex("by_done","done",{unique:false});
        }
        if (!db.objectStoreNames.contains("spools")){
          const st = db.createObjectStore("spools",{keyPath:"id",autoIncrement:true});
          st.createIndex("by_archived","archived",{unique:false});
          st.createIndex("by_name","name",{unique:false});
        }
        if (!db.objectStoreNames.contains("meta")){
          db.createObjectStore("meta",{keyPath:"key"});
        }
      };
      req.onsuccess = ()=>{ _db=req.result; res(); };
      req.onerror = ()=>rej(req.error);
    });
  }
  function _tx(store,mode="readonly"){ const tx=_db.transaction(store,mode); return [tx,tx.objectStore(store)]; }
  function _put(store,obj){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); const r=st.add(obj); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  function _get(store,id){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readonly"); const r=st.get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  function _patch(store,id,patch){ return new Promise((res,rej)=>{ const [tx,st]=_tx(store,"readwrite"); const r=st.get(id);
    r.onsuccess=()=>{ let row=r.result; if(!row) return res(false); const delta=(typeof patch==="function")?patch(row):patch; Object.assign(row,delta); const p=st.put(row); p.onsuccess=()=>res(true); p.onerror=()=>rej(p.error); }; r.onerror=()=>rej(r.error); }); }
  function _setFlag(store,id,flags){ return _patch(store,id,flags); }

  // Movements
  async function addMovement(m){ return _put("movements", m); }
  async function listMovements(username, filter="all", showArchived=false){
    return new Promise((res,rej)=>{
      const [tx,st]=_tx("movements","readonly");
      const idx=st.index("by_user"); const r=idx.getAll(IDBKeyRange.only(username));
      r.onsuccess=()=>{ let rows=r.result.filter(x=>showArchived?true:!x.archived);
        if (filter==="in") rows=rows.filter(x=>x.amount>=0);
        if (filter==="out") rows=rows.filter(x=>x.amount<0);
        rows.sort((a,b)=>new Date(a.date)-new Date(b.date)); res(rows); };
      r.onerror=()=>rej(r.error);
    });
  }
  const archiveMovement = (id)=>_setFlag("movements",id,{archived:true});
  const unarchiveMovement = (id)=>_setFlag("movements",id,{archived:false});

  // Tasks
  async function addTask(t){ return _put("tasks", t); }
  async function listTasks(username, showArchived=false){
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
  const archiveTask = (id)=>_setFlag("tasks",id,{archived:true});
  const unarchiveTask = (id)=>_setFlag("tasks",id,{archived:false});

  // Spools
  const addSpool = (s)=>_put("spools",{name:s.name,price_per_kg:Number(s.price_per_kg),grams_available:Number(s.grams_available)||0,archived:!!s.archived});
  function listSpools(includeArchived=false){
    return new Promise((res,rej)=>{ const [tx,st]=_tx("spools","readonly"); const r=st.getAll(); r.onsuccess=()=>{ const rows=r.result||[]; res(includeArchived?rows:rows.filter(x=>!x.archived)); }; r.onerror=()=>rej(r.error); });
  }
  const getSpool = (id)=>_get("spools",id);
  const addSpoolStock = (id,grams)=>_patch("spools",id,row=>({grams_available:Number(row.grams_available||0)+Number(grams||0)}));
  async function consumeSpool(id,grams){ const row=await getSpool(id); if(!row) return false; if(Number(row.grams_available)<Number(grams)) throw new Error("insufficient"); return _patch("spools",id,{grams_available:Number(row.grams_available)-Number(grams)}); }
  const editSpool = (id,patch)=>_patch("spools",id,patch);
  const archiveSpool = (id)=>_setFlag("spools",id,{archived:true});

  // Meta
  function setMeta(key,value){ return new Promise((res,rej)=>{ const [tx,st]=_tx("meta","readwrite"); const r=st.put({key,value}); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); }); }
  function getMeta(key){ return new Promise((res,rej)=>{ const [tx,st]=_tx("meta","readonly"); const r=st.get(key); r.onsuccess=()=>res(r.result?.value); r.onerror=()=>rej(r.error); }); }

  // Export/Import
  async function exportAll(username){
    const [movs,tasks,spools] = await Promise.all([listMovements(username,"all",true), listTasks(username,true), listSpools(true)]);
    const payload = {version:"3", username, exportedAt:new Date().toISOString(), movements:movs, tasks, spools};
    const checksum = await sha256(JSON.stringify(payload));
    return {meta:{checksum}, payload};
  }
  async function importAll(username,obj){
    if(!obj||!obj.meta||!obj.payload) return false;
    const raw = JSON.stringify(obj.payload);
    if ((await sha256(raw)) !== obj.meta.checksum) return false;
    // pulizia selettiva utente
    await _clearUser(username);
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
  async function sha256(text){ const enc=new TextEncoder().encode(text); const hash = await crypto.subtle.digest("SHA-256", enc); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join(""); }

  return { open, addMovement, listMovements, archiveMovement, unarchiveMovement,
           addTask, listTasks, toggleTask, archiveTask, unarchiveTask,
           addSpool, listSpools, getSpool, addSpoolStock, consumeSpool, editSpool, archiveSpool,
           setMeta, getMeta, exportAll, importAll };
})();
