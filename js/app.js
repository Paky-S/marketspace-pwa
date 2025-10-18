// MarketSpace v1.3.0 (Analisi filtro + Settings + ToDo colori)
const state = {
  version: "0.0.0",
  username: "default",
  currentPage: "page-movimenti",
  palette: "blue",
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
    document.getElementById("app-version").textContent = "v"+cfg.version;
    document.getElementById("version-badge").textContent = "v"+cfg.version;
  }catch{}
}

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
    document.getElementById("mov-date").valueAsDate = new Date();
    bindEvents();
    await refreshMovements();
    await refreshTodos();
  } catch(e){
    console.error("Boot error:", e);
    alert("Si è verificato un errore in avvio. Prova a ricaricare la pagina (Ctrl+F5).");
  } finally {
    hideSplash();
  }
}

document.addEventListener("DOMContentLoaded", boot);

function bindEvents(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>switchPage(btn.dataset.target));
  });

  // Impostazioni
  const dlg = document.getElementById("dlg-settings");
  document.getElementById("btn-settings").addEventListener("click", ()=>{
    document.getElementById("set-palette").value = state.palette || "blue";
    dlg.showModal();
  });
  document.getElementById("set-palette").addEventListener("change", (e)=>{
    applyPalette(e.target.value);
  });

  // Movimenti
  document.getElementById("mov-form").addEventListener("submit", onAddMovement);
  document.getElementById("mov-filter").addEventListener("change", refreshMovements);
  document.getElementById("mov-show-arch").addEventListener("change", refreshMovements);
  document.getElementById("mov-spool").addEventListener("change", onSpoolChange);
  document.getElementById("btn-export").addEventListener("click", onExport);
  document.getElementById("file-import").addEventListener("change", e=>onImport(e.target.files[0]));

  // NUOVO: pulsante Sottrai (setta tipo=Uscita e invia)
  document.getElementById("btn-sub").addEventListener("click", ()=>{
    const out = document.querySelector('input[name="mov-type"][value="out"]');
    if (out) out.checked = true;
    document.getElementById("mov-form").requestSubmit(); // invia il form
  });
  // Magazzino
  document.getElementById("btn-add-spool").addEventListener("click", onAddSpool);

  // To-Do
  document.getElementById("todo-form").addEventListener("submit", onAddTodo);
  document.getElementById("todo-show-arch").addEventListener("change", refreshTodos);
  document.getElementById("btn-archive-done").addEventListener("click", archiveDoneTodos);

  // Analisi
  document.getElementById("range").addEventListener("change", onRangeChange);
  document.getElementById("btn-apply-range").addEventListener("click", (e)=>{ e.preventDefault(); renderAnalytics(); });
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
  const isIn = document.querySelector('input[name="mov-type"]:checked')?.value === "in";
  document.getElementById("row-grams").hidden = !(sel.value && isIn);
}

async function onAddMovement(ev){
  ev.preventDefault();

  // Importo sempre positivo in input
  let amount = Number(String(document.getElementById("mov-amount").value).replace(",","."));
  if (!Number.isFinite(amount) || amount<=0) return alert("Inserisci un importo valido (> 0).");

  const type = document.querySelector('input[name="mov-type"]:checked')?.value || "in";
  if (type === "out") amount = -Math.abs(amount); // uscita = negativo
  else amount = Math.abs(amount);                 // entrata = positivo

  const desc = document.getElementById("mov-desc").value.trim();
  const d = document.getElementById("mov-date").value ? new Date(document.getElementById("mov-date").value) : new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

  let spoolId = document.getElementById("mov-spool").value || null;
  let gramsUsed = 0, materialCost = 0;

  // i grammi/materialCost hanno senso solo per ENTRATA
  if (type === "in" && spoolId){
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

  await DB.addMovement({username:state.username, amount, description:desc, date:iso, archived:false, spoolId, gramsUsed, materialCost});

  // reset form
  document.getElementById("mov-amount").value = "";
  document.getElementById("mov-desc").value = "";
  document.getElementById("mov-grams").value = "";
  document.getElementById("mov-spool").value = "";
  // di default rimetto "Entrata"
  const inRadio = document.querySelector('input[name="mov-type"][value="in"]');
  if (inRadio) inRadio.checked = true;

  onSpoolChange();
  document.getElementById("mov-date").valueAsDate = new Date();
  refreshMovements();
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
    left.innerHTML = `<div><strong>${amountStr}</strong> — ${m.description||""}${extra}</div><div class="muted">${dateStr}</div>`;

    const badge = document.createElement("span"); badge.className = "badge " + (m.amount>=0 ? "ok":"danger"); badge.textContent = (m.amount>=0) ? "Entrata":"Uscita";
    const arch = document.createElement("button"); arch.className="icon-btn"; arch.textContent = m.archived?"Ripristina":"Archivia";
    arch.addEventListener("click", async()=>{ if(m.archived) await DB.unarchiveMovement(m.id); else await DB.archiveMovement(m.id); refreshMovements(); });

    right.append(badge, arch);
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

    const add = document.createElement("button"); add.className="icon-btn"; add.textContent="+g";
    add.addEventListener("click",async()=>{ const g=Number(prompt("Grammi da aggiungere:","100")); if(Number.isFinite(g)&&g>0){ await DB.addSpoolStock(s.id,g); refreshSpools(); }});
    const edit = document.createElement("button"); edit.className="icon-btn"; edit.textContent="Modifica";
    edit.addEventListener("click",async()=>{ const name=prompt("Nome/descrizione:",s.name)??s.name; const price=Number(prompt("Prezzo €/kg:",String(s.price_per_kg)))||s.price_per_kg; await DB.editSpool(s.id,{name:name.trim(),price_per_kg:price}); refreshSpools(); });
    const tog = document.createElement("button"); tog.className="icon-btn"; tog.textContent = s.archived?"Ripristina":"Archivia";
    tog.addEventListener("click",async()=>{ if(s.archived){ await DB.editSpool(s.id,{archived:false}); } else { await DB.archiveSpool(s.id);} refreshSpools(); });

    right.append(add,edit,tog); li.append(left,right); list.appendChild(li);
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
async function onAddTodo(ev){
  ev.preventDefault();
  const desc = document.getElementById("todo-desc").value.trim();
  const prio = document.getElementById("todo-priority").value;
  if (!desc) return;
  await DB.addTask({username:state.username, description:desc, done:false, priority:prio, archived:false});
  document.getElementById("todo-desc").value = "";
  refreshTodos();
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
    const prTxt = { "very-high":"Molto alta", "high":"Alta", "normal":"Normale", "low":"Bassa" }[t.priority] || t.priority;
    left.innerHTML = `<div><strong>${t.description}</strong></div><div class="muted">Priorità: ${prTxt}</div>`;
    const right = document.createElement("div"); right.className="item-actions";
    const done = document.createElement("button"); done.className="icon-btn"; done.textContent = t.done?"☑️":"⬜";
    done.addEventListener("click",async()=>{ await DB.toggleTask(t.id, !t.done); refreshTodos(); });
    const arch = document.createElement("button"); arch.className="icon-btn"; arch.textContent = t.archived?"Ripristina":"Archivia";
    arch.addEventListener("click",async()=>{ if(t.archived) await DB.unarchiveTask(t.id); else await DB.archiveTask(t.id); refreshTodos(); });
    right.append(done,arch);
    li.append(left,right); list.appendChild(li);
  }
}
async function archiveDoneTodos(){
  const items = await DB.listTasks(state.username,false);
  for (const t of items) if (t.done) await DB.archiveTask(t.id);
  refreshTodos();
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
    const prev = byDay.get(key) || 0;
    byDay.set(key, prev + r.amount);
  }
  const days = Array.from(byDay.keys()).sort().map(k=>({ x:new Date(k), val: byDay.get(k) }));

  // Cumulato (step)
  let cum = 0;
  const pts = [];
  for (const d of days){
    if (pts.length) pts.push({ x:new Date(d.x.getTime()-1), y:cum });
    cum += d.val;
    pts.push({ x:d.x, y:cum });
  }
  let points = pts.length ? pts : [{ x:new Date(), y:0 }];

  // Downsample se necessario
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

  drawLineChart(document.getElementById("chart"), points, { step:true });

  // KPI + trend
  const sales = data.filter(r=>r.amount>0);
  const sum = a=>a.reduce((x,y)=>x+y,0);
  const totalSales = sum(sales.map(s=>s.amount));
  const matCost = sum(sales.map(s=>s.materialCost||0));
  const profit = totalSales - matCost;
  const tx = data.length, pos = sales.length, neg = data.filter(r=>r.amount<0).length;
  const f = n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(n);

  let slope=0; if (points.length>=2){
    let sx=0,sy=0,sxx=0,sxy=0; for (let i=0;i<points.length;i++){ const x=i,y=points[i].y; sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; }
    slope = (points.length*sxy - sx*sy) / Math.max(1,(points.length*sxx - sx*sx));
  }
  const trendTxt = slope>0.5 ? "Trend in crescita" : (slope<-0.5 ? "Trend in calo" : "Trend stabile");

  document.getElementById("stats").textContent =
    `Transazioni: ${tx} · Giorni +: ${pos} · Giorni –: ${neg} · Vendite: ${f(totalSales)} · Costo materiale: ${f(matCost)} · Utile stimato: ${f(profit)}`;
  document.getElementById("trend").textContent = trendTxt;
}
