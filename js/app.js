// MarketSpace v1.4.1 (fix: rimozione opzione superflua, badge versione singola 'v', pie chart Entrate vs Uscite)
const state = {
  version: "0.0.0",
  username: "default",
  currentPage: "page-movimenti",
  palette: "blue",
  submitMode: "add" // "add" | "sub"
};

const PALETTES = {
  blue:   { light:{acc:"#0ea5e9",weak:"#bae6fd"}, dark:{acc:"#38bdf8",weak:"#0b2a3a"} },
  red:    { light:{acc:"#ef4444",weak:"#fecaca"}, dark:{acc:"#f87171",weak:"#3b0a0a"} },
  green:  { light:{acc:"#10b981",weak:"#bbf7d0"}, dark:{acc:"#34d399",weak:"#0a2e20"} },
  purple: { light:{acc:"#8b5cf6",weak:"#ddd6fe"}, dark:{acc:"#a78bfa",weak:"#2a0a55"} },
};

function applyPalette(name){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const p = (PALETTES[name]||PALETTES.blue)[dark?'dark':'light'];
  const root = document.documentElement;
  root.style.setProperty("--accent", p.acc);
  root.style.setProperty("--accent-weak", p.weak);
  state.palette = name;
  DB.setMeta("palette", name);
}

async function loadConfig(){
  try{
    const res = await fetch("config.json?ts="+Date.now());
    const cfg = await res.json();
    // Mostra solo la versione nuda; la 'v' è nell'HTML
    document.getElementById("app-version").textContent = cfg.version;
    document.getElementById("version-badge").textContent = cfg.version;
  }catch{}
}

/* ====== FUNZIONI USATE NEL BIND ====== */
async function archiveDoneTodos(){
  const items = await DB.listTasks(state.username,true);
  for (const t of items){ if (t.done && !t.archived) await DB.archiveTask(t.id); }
  refreshTodos();
}

/* ===== Helpers icone inline (stile Lucide semplificate) ===== */
function $ico(name){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('width','18'); svg.setAttribute('height','18');
  svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','2'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
  const p=(d)=>{ const path=document.createElementNS(ns,'path'); path.setAttribute('d',d); return path; };
  if(name==='edit'){ svg.append(p('M12 20h9')); svg.append(p('M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z')); }
  // Archivia: scatola 2D con freccia verso il basso
  else if(name==='archive'){ svg.append(p('M4 5h16v14H4z')); svg.append(p('M12 8v7')); svg.append(p('M9 12l3 3 3-3')); }
  else if(name==='undo'){ svg.append(p('M9 14l-4-4 4-4')); svg.append(p('M5 10h8a6 6 0 1 1 0 12H9')); }
  else if(name==='trash'){ svg.append(p('M3 6h18')); svg.append(p('M8 6V4h8v2')); svg.append(p('M19 6l-1 14H6L5 6')); }
  else if(name==='save'){ svg.append(p('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z')); svg.append(p('M17 21V13H7v8')); svg.append(p('M7 3v5h8')); }
  return svg;
}

/* ===== BOOT ===== */
async function boot(){
  const hideSplash = ()=>{
    const s = document.getElementById("splash");
    const a = document.getElementById("app");
    if (s) s.style.display = "none";
    if (a) a.hidden = false;
  };

  try{
    await loadConfig();
    if ("serviceWorker" in navigator){
      try{ await navigator.serviceWorker.register("sw.js"); }catch(e){ console.warn("SW:", e); }
    }
    try{ await DB.open(); }catch(e){ console.error("IndexedDB:", e); alert("Errore apertura database locale. L'app funziona ma non salverà i dati finché non consenti l'archiviazione."); }

    const pal = await DB.getMeta("palette"); applyPalette(pal||"blue");
    const date = document.getElementById("mov-date"); if (date) date.valueAsDate = new Date();

    bindEvents();

    // Stato persistente delle spunte "Mostra archiviati"
    const mck = document.getElementById("mov-show-arch");
    const tck = document.getElementById("todo-show-arch");
    const movPref  = await DB.getMeta("mov_show_arch");
    const todoPref = await DB.getMeta("todo_show_arch");
    if (mck)  mck.checked  = !!movPref;
    if (tck)  tck.checked  = !!todoPref;

    // Recovery manuale opzionale: ?unarchive=1
    if (new URL(location.href).searchParams.get("unarchive") === "1"){
      await recoverUnarchiveAll();
    }

    await refreshMovements();
    await refreshTodos();
  } catch(e){
    console.error("Boot error:", e);
    alert("Errore in avvio. Fai un hard refresh (Ctrl+F5). Vedi Console per dettagli.");
  } finally {
    hideSplash();
  }
}
document.addEventListener("DOMContentLoaded", boot);

function bindEvents(){
  const $ = (id)=>document.getElementById(id);
  const on = (el,ev,fn)=>{ if(el && typeof fn === "function") el.addEventListener(ev,fn); };

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>switchPage(btn.dataset.target));
  });

  // Impostazioni
  const dlg = $("dlg-settings");
  if (dlg){
    on($("btn-settings"),"click",()=>{
      $("set-palette").value = state.palette || "blue";
      dlg.showModal();
    });
    on($("set-palette"),"change",(e)=>applyPalette(e.target.value));
  }

  // Movimenti
  on($("mov-form"),"submit", onAddMovement);
  on($("mov-filter"),"change", refreshMovements);
  on($("mov-show-arch"),"change", e=>{ DB.setMeta("mov_show_arch", e.target.checked); refreshMovements(); });
  on($("mov-spool"),"change", onSpoolChange);
  on($("btn-export"),"click", onExport);
  on($("file-import"),"change", e=>onImport(e.target.files[0]));
  on($("btn-sub"),"click", ()=>{ state.submitMode="sub"; $("mov-form").requestSubmit(); });
  on($("btn-add"),"click", ()=>{ state.submitMode="add"; });

  // Magazzino
  on($("btn-add-spool"),"click", onAddSpool);

  // To-Do
  const todoForm = $("todo-form");
  if (todoForm){
    on(todoForm, "submit", onAddTodo);
    on($("todo-add-btn"),"click", (e)=>{ e.preventDefault(); onAddTodo(e); });
  }
  on($("todo-show-arch"),"change", e=>{ DB.setMeta("todo_show_arch", e.target.checked); refreshTodos(); });
  on($("btn-archive-done"),"click", archiveDoneTodos);

  // Analisi
  on($("range"),"change", onRangeChange);
  on($("btn-apply-range"),"click", (e)=>{ e.preventDefault(); renderAnalytics(); });
}

function switchPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelector(`.tab[data-target="${id}"]`).classList.add("active");
  const map = {"page-movimenti":"Movimenti","page-magazzino":"Magazzino","page-todo":"To-Do","page-analisi":"Analisi"};
  document.getElementById("page-title").textContent = map[id]||"MarketSpace";
  state.currentPage = id;
  if (id==="page-analisi") renderAnalytics();
  if (id==="page-magazzino") refreshSpools();
}

/* ===== Movimenti ===== */
function onSpoolChange(){
  const sel = document.getElementById("mov-spool");
  const row = document.getElementById("row-grams");
  if (row) row.hidden = !(sel && sel.value);
}

async function onAddMovement(ev){
  ev.preventDefault();

  let amount = Number(String(document.getElementById("mov-amount").value).replace(",","."));
  if (!Number.isFinite(amount) || amount<=0) return alert("Inserisci un importo valido (> 0).");

  const isAdd = state.submitMode === "add";
  amount = isAdd ? Math.abs(amount) : -Math.abs(amount);

  const itemName = String(document.getElementById("mov-item").value||"").trim();
  const desc = String(document.getElementById("mov-desc").value||"").trim();
  if (!itemName) return alert("Inserisci il Nome Oggetto.");
  if (!desc) return alert("Inserisci la Descrizione.");

  const dInp = document.getElementById("mov-date");
  const d = dInp && dInp.value ? new Date(dInp.value) : new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

  let spoolId = document.getElementById("mov-spool")?.value || null;
  let gramsUsed = 0, materialCost = 0;

  if (isAdd && spoolId){
    gramsUsed = Number(document.getElementById("mov-grams").value);
    if (!Number.isFinite(gramsUsed) || gramsUsed<=0) return alert("Inserisci i grammi usati (>0) o deseleziona il filamento.");
    const s = await DB.getSpool(Number(spoolId));
    if (!s) return alert("Bobina non trovata.");
    if (s.grams_available < gramsUsed) return alert("Grammatura insufficiente in magazzino.");
    materialCost = s.price_per_kg * (gramsUsed/1000);
    await DB.consumeSpool(s.id, gramsUsed);
  } else {
    spoolId=null; gramsUsed=0; materialCost=0;
  }

  await DB.addMovement({
    username:state.username,
    amount, description:desc, itemName,
    date:iso, archived:false,
    spoolId, gramsUsed, materialCost
  });

  document.getElementById("mov-amount").value = "";
  document.getElementById("mov-item").value = "";
  document.getElementById("mov-desc").value = "";
  const g = document.getElementById("mov-grams"); if (g) g.value = "";
  const sp = document.getElementById("mov-spool"); if (sp) sp.value = "";
  if (dInp) dInp.valueAsDate = new Date();
  onSpoolChange();
  state.submitMode = "add";

  await refreshMovements();
  if (state.currentPage==="page-analisi") renderAnalytics();
}

async function refreshMovements(){
  const filter = document.getElementById("mov-filter").value;
  const showArch = document.getElementById("mov-show-arch").checked;
  const list = document.getElementById("mov-list"); list.innerHTML="";
  const rows = await DB.listMovements(state.username, filter, showArch);
  let saldo=0; for (const m of rows) if (!m.archived) saldo += m.amount;
  document.getElementById("saldo").textContent = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(saldo);

  for (const m of rows){
    const li = document.createElement("li"); if (m.archived) li.classList.add("archived");
    const left = document.createElement("div");
    const right = document.createElement("div"); right.className="item-actions";
    const dateStr = new Intl.DateTimeFormat("it-IT").format(new Date(m.date));
    const amountStr = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(m.amount);
    let extra = "";
    if (m.spoolId && m.gramsUsed){
      const costStr = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(m.materialCost||0);
      extra=` · Filamento: #${m.spoolId} · ${m.gramsUsed} g (costo ${costStr})`;
    }
    const namePart = (m.itemName ? `<strong>${m.itemName}</strong> — ` : "");
    left.innerHTML = `<div>${namePart}${amountStr} — ${m.description||""}${extra}</div><div class="muted">${dateStr}</div>`;

    const mkBtn = (title,icon,handler)=>{
      const b=document.createElement("button");
      b.className="icon-btn icon-only"; b.title=title; b.setAttribute("aria-label",title);
      b.appendChild($ico(icon)); b.addEventListener("click",handler); return b;
    };

    const btnEdit = mkBtn("Modifica","edit", async()=>{
      const itemRaw = prompt("Nome oggetto:", m.itemName ?? "");
      if (itemRaw === null) return;
      const descRaw = prompt("Descrizione:", m.description ?? "");
      if (descRaw === null) return;
      const amtRaw  = prompt("Importo (usa punto per i decimali):", String(Math.abs(Number(m.amount)||0)));
      if (amtRaw === null) return;

      const item = String(itemRaw).trim();
      const desc = String(descRaw).trim();
      const amt  = Number(String(amtRaw).replace(",", "."));
      if (!item) return alert("Nome oggetto obbligatorio.");
      if (!desc) return alert("Descrizione obbligatoria.");
      if (!Number.isFinite(amt) || amt<=0) return alert("Importo non valido.");

      const finalAmount = (m.amount>=0) ? Math.abs(amt) : -Math.abs(amt);
      await DB.editMovement(m.id, { itemName: item, description: desc, amount: finalAmount });
      await refreshMovements(); if (state.currentPage==="page-analisi") renderAnalytics();
    });

    const btnArch = mkBtn(m.archived?"Ripristina":"Archivia", m.archived?"undo":"archive", async()=>{
      if(m.archived) await DB.unarchiveMovement(m.id); else await DB.archiveMovement(m.id);
      await refreshMovements(); if (state.currentPage==="page-analisi") renderAnalytics();
    });

    const btnDel = mkBtn("Elimina","trash", async()=>{
      if (!confirm("Eliminare definitivamente questa transazione?")) return;
      await DB.deleteMovement(m.id);
      await refreshMovements(); if (state.currentPage==="page-analisi") renderAnalytics();
    });

    right.append(btnEdit, btnArch, btnDel);
    li.append(left, right); list.appendChild(li);
  }

  const sel = document.getElementById("mov-spool");
  const keep = sel.value;
  const spools = await DB.listSpools();
  sel.innerHTML = '<option value="">— nessuno —</option>' + spools.map(s=>`<option value="${s.id}">${s.name} · ${s.grams_available} g</option>`).join("");
  sel.value = spools.some(s=>String(s.id)===keep) ? keep : "";
}

/* ===== Magazzino ===== */
async function onAddSpool(){
  const name = (prompt("Nome/descrizione bobina:")||"").trim(); if (!name) return;
  const price = Number(prompt("Prezzo €/kg:","20")); if (!Number.isFinite(price)||price<=0) return alert("Prezzo non valido.");
  const grams = Number(prompt("Grammi disponibili:","1000")); if (!Number.isFinite(grams)||grams<0) return alert("Grammatura non valida.");
  await DB.addSpool({name, price_per_kg:price, grams_available:grams, archived:false});
  refreshSpools();
}
async function refreshSpools(){
  const list = document.getElementById("spool-list"); list.innerHTML="";
  const rows = await DB.listSpools(true);
  for (const s of rows){
    const li = document.createElement("li"); if (s.archived) li.classList.add("archived");
    const left = document.createElement("div");
    left.innerHTML = `<div><strong>${s.name}</strong> — € ${(s.price_per_kg).toFixed(2)}/kg</div><div class="muted">Disponibili: ${s.grams_available} g</div>`;
    const right = document.createElement("div"); right.className="item-actions";

    const mkBtn = (title,icon,handler)=>{ const b=document.createElement("button"); b.className="icon-btn icon-only"; b.title=title; b.appendChild($ico(icon)); b.addEventListener("click",handler); return b; };

    const edit = mkBtn("Modifica","edit",async()=>{ const name=prompt("Nome/descrizione:",s.name)??s.name; const price=Number(prompt("Prezzo €/kg:",String(s.price_per_kg)))||s.price_per_kg; await DB.editSpool(s.id,{name:String(name||"").trim(),price_per_kg:price}); refreshSpools(); });
    const tog  = mkBtn(s.archived?"Ripristina":"Archivia", s.archived?"undo":"archive", async()=>{ if(s.archived){ await DB.editSpool(s.id,{archived:false}); } else { await DB.archiveSpool(s.id);} refreshSpools(); });

    right.append(edit,tog); li.append(left,right); list.appendChild(li);
  }
}

/* ===== Export/Import ===== */
async function onExport(){
  const data = await DB.exportAll(state.username);
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:`marketspace_${state.username}_${new Date().toISOString().slice(0,10)}.json`});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function onImport(file){
  if(!file) return;
  try{
    const ok = await DB.importAll(state.username, JSON.parse(await file.text()));
    if (!ok) return alert("File non valido o corrotto.");
    await refreshMovements(); await refreshTodos(); if(state.currentPage==="page-analisi") renderAnalytics();
  }catch{ alert("Errore nel parsing del file."); }
}

/* ===== To-Do ===== */
let _addingTodo = false;
async function onAddTodo(ev){
  ev.preventDefault();
  if (_addingTodo) return;
  _addingTodo = true;
  try{
    const desc = String(document.getElementById("todo-desc").value||"").trim();
    const prio = document.getElementById("todo-priority").value || "normal";
    if (!desc){ _addingTodo=false; return; }
    await DB.addTask({username:state.username, description:desc, done:false, priority:prio, archived:false});
    document.getElementById("todo-desc").value = "";
    await refreshTodos();
  } finally { _addingTodo=false; }
}

async function refreshTodos(){
  const showArch = document.getElementById("todo-show-arch").checked;
  const list = document.getElementById("todo-list"); list.innerHTML="";
  const items = await DB.listTasks(state.username, showArch);
  for (const t of items){
    const li = document.createElement("li");
    if (t.archived) li.classList.add("archived");
    const prClass = t.priority ? ("prio-"+t.priority.replace(/_/g,"-")) : "";
    if (prClass) li.classList.add(prClass);

    const left = document.createElement("div");
    const prTxt = { "very-high":"Molto alta", "high":"Alta", "normal":"Normale", "low":"Bassa" }[t.priority] || t.priority || "Normale";
    left.innerHTML = `<div><strong>${t.description||"(senza testo)"}</strong></div><div class="muted">Priorità: ${prTxt}</div>`;

    const right = document.createElement("div"); right.className="item-actions";
    const mkBtn = (title,icon,handler)=>{ const b=document.createElement("button"); b.className="icon-btn icon-only"; b.title=title; b.setAttribute("aria-label",title); b.appendChild($ico(icon)); b.addEventListener("click",handler); return b; };

    // ✓ checkbox semplice per completare / riaprire
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!t.done;
    chk.title = t.done ? "Segna come incompleta" : "Completa";
    chk.addEventListener("change", async ()=>{
      await DB.toggleTask(t.id, chk.checked);
      refreshTodos();
    });

    const edit = mkBtn("Modifica","edit", async ()=>{
      const newDescRaw = prompt("Modifica descrizione:", t.description ?? "");
      if (newDescRaw === null) return;
      const newDesc = String(newDescRaw).trim();
      let newPrioRaw = prompt('Priorità (very-high, high, normal, low):', t.priority ?? "normal");
      if (newPrioRaw === null) return;
      let newPrio = String(newPrioRaw).trim();
      if (!["very-high","high","normal","low"].includes(newPrio)) newPrio = t.priority || "normal";
      await DB.editTask(t.id, { description: newDesc || t.description, priority: newPrio });
      refreshTodos();
    });

    const arch = mkBtn(t.archived?"Ripristina":"Archivia", t.archived?"undo":"archive", async()=>{ if(t.archived) await DB.unarchiveTask(t.id); else await DB.archiveTask(t.id); refreshTodos(); });
    const del  = mkBtn("Elimina","trash", async()=>{ if (confirm("Eliminare questa attività?")){ await DB.deleteTask(t.id); refreshTodos(); } });

    right.append(chk, edit, arch, del);
    li.append(left,right); list.appendChild(li);
  }
}

/* ===== Analisi ===== */
function onRangeChange(){
  const v = document.getElementById("range").value;
  const from = document.getElementById("date-from");
  const to = document.getElementById("date-to");
  const sep = document.getElementById("date-sep");
  const btn = document.getElementById("btn-apply-range");

  const show = (v === "custom");
  from.style.display = show ? "" : "none";
  to.style.display = show ? "" : "none";
  sep.style.display = show ? "" : "none";
  btn.style.display = show ? "" : "none";

  if (show){
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth()-1, now.getDate());
    from.valueAsDate = from.value ? new Date(from.value) : start;
    to.valueAsDate   = to.value   ? new Date(to.value)   : now;
  } else {
    renderAnalytics();
  }
}

async function renderAnalytics(){
  const range = document.getElementById("range").value;
  const rows = await DB.listMovements(state.username,"all",true);

  let start = new Date(0), end = new Date();
  const now = new Date();

  if (range === "year"){ start = new Date(now.getFullYear(),0,1); }
  else if (range === "month"){ start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (range === "week"){
    const wd = now.getDay() || 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - wd + 1);
  }
  else if (range === "custom"){
    const f = document.getElementById("date-from").value;
    const t = document.getElementById("date-to").value;
    if (f) start = new Date(f);
    if (t) end   = new Date(t);
  }

  const toUTC0 = (d)=>new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  start = toUTC0(start); end = toUTC0(end);

  const data = rows.map(r=>({...r, d:new Date(r.date)}))
                   .filter(r=> r.d >= start && r.d <= new Date(end.getTime()+86400000-1))
                   .sort((a,b)=>a.d-b.d);

  // Bucket giornaliero
  const byDay = new Map();
  for (const r of data){
    const key = toUTC0(r.d).toISOString();
    byDay.set(key, (byDay.get(key)||0) + r.amount);
  }
  const days = Array.from(byDay.keys()).sort().map(k=>({ x:new Date(k), val: byDay.get(k) }));

  // Cumulato
  let cum = 0;
  let points = [];
  for (const d of days){
    cum += d.val;
    points.push({ x:d.x, y:cum });
  }
  if (!points.length) points = [{ x:new Date(), y:0 }];

  // Downsample
  const MAX_POINTS = 2000;
  if (points.length > MAX_POINTS){
    const step = Math.ceil(points.length / MAX_POINTS);
    const slim = [];
    for (let i=0;i<points.length;i+=step){ slim.push(points[i]); }
    if (slim[slim.length-1].x.getTime() !== points[points.length-1].x.getTime()){
      slim.push(points[points.length-1]);
    }
    points = slim;
  }

  // Lineare
  drawLineChart(document.getElementById("chart"), points, { step:false });

  // KPI + trend
  const sales = data.filter(r=>r.amount>0);
  const outgo = data.filter(r=>r.amount<0);
  const sum = a=>a.reduce((x,y)=>x+y,0);
  const totalSales = sum(sales.map(s=>s.amount));
  const totalOut   = Math.abs(sum(outgo.map(o=>o.amount))); // valore assoluto per il pie
  const matCost = sum(sales.map(s=>s.materialCost||0));
  const profit = totalSales - matCost;
  const tx = data.length, pos = sales.length, neg = outgo.length;
  const f = n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(n);

  let slope=0; if (points.length>=2){
    let sx=0,sy=0,sxx=0,sxy=0; for (let i=0;i<points.length;i++){ const x=i,y=points[i].y; sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; }
    slope = (points.length*sxy - sx*sy) / Math.max(1,(points.length*sxx - sx*sx));
  }
  const trendTxt = slope>0.5 ? "Trend in crescita" : (slope<-0.5 ? "Trend in calo" : "Trend stabile");

  document.getElementById("stats").innerHTML =
    `<div>Transazioni: ${tx}</div>
     <div>Entrate: ${pos} · Uscite: ${neg}</div>
     <div>Vendite: ${f(totalSales)}</div>
     <div>Costo materiale: ${f(matCost)}</div>
     <div>Utile stimato: ${f(profit)}</div>`;
  document.getElementById("trend").textContent = trendTxt;

  // === NUOVO PIE: Entrate vs Uscite (percentuali) ===
  const pieCanvas = document.getElementById("pie");
  const legendEl  = document.getElementById("pie-legend");
  const pieData = [
    { label: "Entrate", value: totalSales },
    { label: "Uscite",  value: totalOut }
  ];
  drawPieChart(pieCanvas, pieData, { legendEl });
}

/* ===== Recovery opzionale ===== */
async function recoverUnarchiveAll(){
  const [movs, tasks] = await Promise.all([
    DB.listMovements(state.username,"all",true),
    DB.listTasks(state.username,true)
  ]);
  for (const m of movs){ if (m.archived) await DB.unarchiveMovement(m.id); }
  for (const t of tasks){ if (t.archived) await DB.unarchiveTask(t.id); }
}
