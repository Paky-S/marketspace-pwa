// MarketSpace v1.5 - Nuova versione con form a tab
let _spoolsCache = [];

const state = {
  version: "0.0.0",
  username: "default",
  currentPage: "page-movimenti",
  theme: "system",
  palette: "blue",
  submitMode: "add",
  purchaseSpoolCount: 1
};

const PALETTES = {
  blue:   { light:{acc:"#0ea5e9",weak:"#bae6fd"}, dark:{acc:"#38bdf8",weak:"#0b2a3a"} },
  red:    { light:{acc:"#ef4444",weak:"#fecaca"}, dark:{acc:"#f87171",weak:"#3b0a0a"} },
  green:  { light:{acc:"#10b981",weak:"#bbf7d0"}, dark:{acc:"#34d399",weak:"#0a2e20"} },
  purple: { light:{acc:"#8b5cf6",weak:"#ddd6fe"}, dark:{acc:"#a78bfa",weak:"#2a0a55"} },
};

const COLORS = [
  { name: "Nero", hex: "#1a1a1a" },
  { name: "Bianco", hex: "#f5f5f5" },
  { name: "Rosso", hex: "#e53935" },
  { name: "Blu", hex: "#1e88e5" },
  { name: "Verde", hex: "#43a047" },
  { name: "Giallo", hex: "#fdd835" },
  { name: "Arancione", hex: "#fb8c00" },
  { name: "Viola", hex: "#8e24aa" },
  { name: "Rosa", hex: "#d81b60" },
  { name: "Grigio", hex: "#757575" },
  { name: "Marrone", hex: "#6d4c41" },
  { name: "Trasparente", hex: "#90caf9" },
  { name: "Oro", hex: "#ffd700" },
  { name: "Argento", hex: "#c0c0c0" },
  { name: "Beige", hex: "#f5f5dc" },
  { name: "Turchese", hex: "#00acc1" },
];

function applyPalette(name){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const p = (PALETTES[name]||PALETTES.blue)[dark?'dark':'light'];
  const root = document.documentElement;
  root.style.setProperty("--accent", p.acc);
  root.style.setProperty("--accent-weak", p.weak);
  state.palette = name;
  DB.setMeta("palette", name);
}

function applyTheme(themeName){
  state.theme = themeName;
  const root = document.documentElement;
  
  if (themeName === "system") {
    root.removeAttribute("data-theme");
    root.removeAttribute("data-mode");
  } else {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute("data-theme", themeName);
    root.setAttribute("data-mode", dark ? "dark" : "light");
  }
  DB.setMeta("theme", themeName);
}

// Listen for system theme changes
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === "system") {
    applyTheme("system");
  }
});

async function loadConfig(){
  try{
    const res = await fetch("config.json?ts="+Date.now());
    const cfg = await res.json();
    document.getElementById("app-version").textContent = "v"+cfg.version;
    document.getElementById("version-badge").textContent = "v"+cfg.version;
  }catch{}
}

/* ===== Helpers icone inline ===== */
function $ico(name){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg'); 
  svg.setAttribute('viewBox','0 0 24 24'); 
  svg.setAttribute('width','18'); 
  svg.setAttribute('height','18');
  svg.setAttribute('fill','none'); 
  svg.setAttribute('stroke','currentColor'); 
  svg.setAttribute('stroke-width','2'); 
  svg.setAttribute('stroke-linecap','round'); 
  svg.setAttribute('stroke-linejoin','round');
  const p=(d)=>{ const path=document.createElementNS(ns,'path'); path.setAttribute('d',d); return path; };
  
  if(name==='edit'){ svg.append(p('M12 20h9')); svg.append(p('M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z')); }
  else if(name==='archive'){ svg.append(p('M4 5h16v14H4z')); svg.append(p('M12 8v7')); svg.append(p('M9 12l3 3 3-3')); }
  else if(name==='undo'){ svg.append(p('M9 14l-4-4 4-4')); svg.append(p('M5 10h8a6 6 0 1 1 0 12H9')); }
  else if(name==='trash'){ svg.append(p('M3 6h18')); svg.append(p('M8 6V4h8v2')); svg.append(p('M19 6l-1 14H6L5 6')); }
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
    try{ await DB.open(); }catch(e){ console.error("IndexedDB:", e); alert("Errore apertura database locale."); }

    // Carica preferenze
    const pal = await DB.getMeta("palette"); applyPalette(pal||"blue");
    const theme = await DB.getMeta("theme"); applyTheme(theme||"system");
    
    const date = document.getElementById("sale-date"); 
    if (date) date.valueAsDate = new Date();
    const dateExp = document.getElementById("expense-date");
    if (dateExp) dateExp.valueAsDate = new Date();
    const datePur = document.getElementById("purchase-date");
    if (datePur) datePur.valueAsDate = new Date();

    bindEvents();

    const mck = document.getElementById("mov-show-arch");
    const tck = document.getElementById("todo-show-arch");
    const movPref  = await DB.getMeta("mov_show_arch");
    const todoPref = await DB.getMeta("todo_show_arch");
    if (mck)  mck.checked  = !!movPref;
    if (tck)  tck.checked  = !!todoPref;

    if (new URL(location.href).searchParams.get("unarchive") === "1"){
      await recoverUnarchiveAll();
    }

    await refreshMovements();
    await refreshTodos();
  } catch(e){
    console.error("Boot error:", e);
    alert("Errore in avvio. Fai un hard refresh (Ctrl+F5).");
  } finally {
    hideSplash();
  }
}
document.addEventListener("DOMContentLoaded", boot);

/* ===== EVENT BINDING ===== */
function bindEvents(){
  const $ = (id)=>document.getElementById(id);
  const on = (el,ev,fn)=>{ if(el && typeof fn === "function") el.addEventListener(ev,fn); };

  // Tab navigation
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>switchPage(btn.dataset.target));
  });

  // Form tabs (sale/expense/purchase)
  document.querySelectorAll(".form-tab").forEach(btn=>{
    btn.addEventListener("click",()=>switchFormTab(btn.dataset.tab));
  });

  // Settings
  const dlg = $("dlg-settings");
  on($("btn-settings"),"click",()=>{
    const cur = state.theme || "system";
    document.querySelectorAll(".theme-swatch").forEach(s=>{
      s.classList.toggle("active", s.dataset.theme === cur);
    });
    dlg.showModal();
  });
  document.querySelectorAll(".theme-swatch").forEach(s=>{
    s.addEventListener("click",()=>{
      document.querySelectorAll(".theme-swatch").forEach(x=>x.classList.remove("active"));
      s.classList.add("active");
      applyTheme(s.dataset.theme);
    });
  });
  on($("btn-export"),"click", onExport);
  on($("file-import"),"change", e=>onImport(e.target.files[0]));
  // Sale form
  on($("form-sale"),"submit", onAddSale);
  on($("btn-add-filament"),"click", addFilamentRow);
  
  // Expense form
  on($("form-expense"),"submit", onAddExpense);
  
  // Purchase form
  on($("form-purchase"),"submit", onAddPurchase);
  initPurchaseSpoolSelector();

  // Movements list
  on($("mov-filter"),"change", refreshMovements);
  on($("mov-show-arch"),"change", e=>{ DB.setMeta("mov_show_arch", e.target.checked); refreshMovements(); });

  // Warehouse
  on($("btn-add-spool"),"click", onAddSpoolManual);

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
  if (id==="page-magazzino") { refreshSpools(); refreshSpoolStats(); }
}

function switchFormTab(tabName){
  const tab = document.querySelector(`.form-tab[data-tab="${tabName}"]`);
  const isAlreadyActive = tab.classList.contains("active");
  const formOpen = !!document.querySelector(".mov-form.active");

  document.querySelectorAll(".form-tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".mov-form").forEach(f=>f.classList.remove("active"));

  if (isAlreadyActive && formOpen) return; // stesso tab → chiudi

  tab.classList.add("active");
  document.getElementById(`form-${tabName}`).classList.add("active");
}

/* ===== FILAMENT ROWS ===== */
function buildSpoolOptions(spools){
  return '<option value="">— nessuno —</option>' +
    spools.map(s=>`<option value="${s.id}">${s.name||s.material}${s.brand?' - '+s.brand:''} • ${s.grams_available}g • €${Number(s.price_per_kg).toFixed(2)}/kg</option>`).join("");
}

function createFilamentRow(){
  const div = document.createElement("div");
  div.className = "filament-row";
  div.innerHTML = `
    <div class="filament-row-main">
      <select class="filament-spool">${buildSpoolOptions(_spoolsCache)}</select>
      <button type="button" class="btn-filament-remove" title="Rimuovi">−</button>
    </div>
    <div class="filament-details" hidden>
      <input class="filament-grams" type="number" step="1" min="1" placeholder="grammi usati" inputmode="numeric">
      <span class="filament-cost-display"></span>
    </div>`;
  div.querySelector(".filament-spool").addEventListener("change", ()=>onFilamentRowChange(div));
  div.querySelector(".filament-grams").addEventListener("input", ()=>updateFilamentRowCost(div));
  div.querySelector(".btn-filament-remove").addEventListener("click", ()=>removeFilamentRow(div));
  return div;
}

function addFilamentRow(){
  const container = document.getElementById("filament-rows");
  if (!container || container.children.length >= 6) return;
  container.appendChild(createFilamentRow());
  syncFilamentUI();
}

function removeFilamentRow(row){
  row.remove();
  updateFilamentTotal();
  syncFilamentUI();
}

function syncFilamentUI(){
  const rows = document.querySelectorAll(".filament-row");
  const addBtn = document.getElementById("btn-add-filament");
  if (addBtn) addBtn.hidden = rows.length >= 6;
  rows.forEach((r, i) => {
    r.querySelector(".btn-filament-remove").hidden = rows.length === 1 && i === 0;
  });
}

function onFilamentRowChange(row){
  const sel = row.querySelector(".filament-spool");
  const details = row.querySelector(".filament-details");
  details.hidden = !sel.value;
  if (!sel.value){
    row.querySelector(".filament-grams").value = "";
    row.querySelector(".filament-cost-display").textContent = "";
  }
  updateFilamentTotal();
}

function updateFilamentRowCost(row){
  const spoolId = Number(row.querySelector(".filament-spool").value);
  const grams = Number(row.querySelector(".filament-grams").value);
  const display = row.querySelector(".filament-cost-display");
  const spool = _spoolsCache.find(s=>s.id===spoolId);
  if (spool && grams > 0){
    display.textContent = "= " + formatCurrency(spool.price_per_kg*(grams/1000));
  } else {
    display.textContent = "";
  }
  updateFilamentTotal();
}

function updateFilamentTotal(){
  let total = 0, count = 0;
  document.querySelectorAll(".filament-row").forEach(row=>{
    const spoolId = Number(row.querySelector(".filament-spool").value);
    const grams = Number(row.querySelector(".filament-grams").value);
    const spool = _spoolsCache.find(s=>s.id===spoolId);
    if (spool && grams > 0){ total += spool.price_per_kg*(grams/1000); count++; }
  });
  const totalDiv = document.getElementById("filament-total");
  const totalVal = document.getElementById("filament-total-value");
  if (totalDiv) totalDiv.hidden = count === 0;
  if (totalVal && count > 0) totalVal.textContent = formatCurrency(total);
}

/* ===== SALE FORM ===== */
async function onAddSale(ev){
  ev.preventDefault();

  let amount = Number(String(document.getElementById("sale-amount").value).replace(",","."));
  if (!Number.isFinite(amount) || amount<=0) return alert("Inserisci un importo valido.");

  const itemName = String(document.getElementById("sale-item").value||"").trim();
  const desc = String(document.getElementById("sale-desc").value||"").trim();
  const customer = String(document.getElementById("sale-customer").value||"").trim();
  if (!itemName) return alert("Inserisci l'oggetto.");
  if (!desc) return alert("Inserisci una descrizione.");

  const dInp = document.getElementById("sale-date");
  const d = dInp && dInp.value ? new Date(dInp.value) : new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

  // Raccolta dati filamenti
  const filaments = [];
  let totalMaterialCost = 0;
  for (const row of document.querySelectorAll(".filament-row")){
    const spoolId = Number(row.querySelector(".filament-spool").value)||null;
    if (!spoolId) continue;
    const grams = Number(row.querySelector(".filament-grams").value);
    if (!grams || grams<=0) return alert("Inserisci i grammi usati per ogni filamento selezionato.");
    const s = _spoolsCache.find(s=>s.id===spoolId);
    if (!s) return alert("Bobina non trovata.");
    if (s.grams_available < grams) return alert(`Grammatura insufficiente per ${s.name||s.material}.`);
    filaments.push({spoolId, gramsUsed:grams, cost: s.price_per_kg*(grams/1000)});
    totalMaterialCost += s.price_per_kg*(grams/1000);
  }
  for (const f of filaments) await DB.consumeSpool(f.spoolId, f.gramsUsed);
  const primary = filaments[0] || null;

  await DB.addMovement({
    username:state.username,
    type: 'sale',
    amount,
    description:desc,
    itemName,
    customer,
    date:iso,
    archived:false,
    spoolId: primary?.spoolId||null,
    gramsUsed: primary?.gramsUsed||0,
    materialCost: totalMaterialCost,
    filaments,
  });

  // Reset form
  document.getElementById("sale-amount").value = "";
  document.getElementById("sale-item").value = "";
  document.getElementById("sale-desc").value = "";
  document.getElementById("sale-customer").value = "";
  document.getElementById("sale-date").valueAsDate = new Date();
  document.getElementById("filament-rows").innerHTML = "";
  addFilamentRow();
  const ft = document.getElementById("filament-total");
  if (ft) ft.hidden = true;

  await refreshMovements();
  if (state.currentPage==="page-analisi") renderAnalytics();
}

/* ===== EXPENSE FORM ===== */
async function onAddExpense(ev){
  ev.preventDefault();

  let amount = Number(String(document.getElementById("expense-amount").value).replace(",","."));
  if (!Number.isFinite(amount) || amount<=0) return alert("Inserisci un importo valido.");
  
  amount = -Math.abs(amount); // negativo per spesa

  const desc = String(document.getElementById("expense-desc").value||"").trim();
  if (!desc) return alert("Inserisci una descrizione.");

  const dInp = document.getElementById("expense-date");
  const d = dInp && dInp.value ? new Date(dInp.value) : new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();

  await DB.addMovement({
    username:state.username,
    type: 'expense',
    amount,
    description: desc,
    itemName: '',
    customer: '',
    date: iso,
    archived: false
  });

  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-date").valueAsDate = new Date();

  await refreshMovements();
  if (state.currentPage==="page-analisi") renderAnalytics();
}

/* ===== PURCHASE FORM ===== */
function initPurchaseSpoolSelector(){
  const display = document.getElementById("spool-count-display");
  document.getElementById("spool-count-minus").addEventListener("click", ()=>{
    if (state.purchaseSpoolCount > 1){ state.purchaseSpoolCount--; display.textContent = state.purchaseSpoolCount; renderPurchaseSpools(); }
  });
  document.getElementById("spool-count-plus").addEventListener("click", ()=>{
    if (state.purchaseSpoolCount < 20){ state.purchaseSpoolCount++; display.textContent = state.purchaseSpoolCount; renderPurchaseSpools(); }
  });
  renderPurchaseSpools();
}

function renderPurchaseSpools(){
  const container = document.getElementById("purchase-spools-container");
  container.innerHTML = '';

  for (let i = 0; i < state.purchaseSpoolCount; i++) {
    const item = document.createElement('div');
    item.className = 'purchase-spool-item';
    item.innerHTML = `
      <div class="purchase-spool-header">Bobina ${i + 1}</div>
      <div class="row">
        <label>Materiale</label>
        <select class="purchase-material" id="pur-material-${i}">
          ${DB.MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('')}
        </select>
        <input type="text" class="purchase-material-custom" id="pur-material-custom-${i}" placeholder="Inserisci materiale..." style="display:none;margin-top:6px;">
      </div>
      <div class="row">
        <label>Marca</label>
        <input type="text" class="purchase-brand" id="pur-brand-${i}" placeholder="es. Bambulab, Sunlu, eSun, Hatchbox...">
      </div>
      <div class="row">
        <label>Colore</label>
        <div class="color-picker-wrapper" id="pur-color-${i}">
          ${COLORS.map((c, idx)=>`
            <input type="radio" name="pur-color-${i}" value="${c.hex}" id="pur-color-${i}-${idx}" class="color-option-input" ${idx === 0 ? 'checked' : ''}>
            <label for="pur-color-${i}-${idx}" class="color-option ${idx === 0 ? 'selected' : ''}" style="background:${c.hex}" title="${c.name}" data-color="${c.hex}" data-name="${c.name}"></label>
          `).join('')}
        </div>
      </div>
      <div class="row">
        <label>Grammi</label>
        <select class="purchase-grams" id="pur-grams-${i}">
          ${DB.GRAM_OPTIONS.map(g=>`<option value="${g}" ${g===1000?'selected':''}>${g}g</option>`).join('')}
        </select>
      </div>
      <div class="row">
        <label>Costo bobina (€)</label>
        <input type="text" class="purchase-cost" id="pur-cost-${i}" inputmode="decimal" placeholder="es. 20.00">
      </div>
    `;
    container.appendChild(item);

    // Mostra input custom se ALTRO selezionato
    const matSel = item.querySelector(`#pur-material-${i}`);
    const matCustom = item.querySelector(`#pur-material-custom-${i}`);
    matSel.addEventListener('change', ()=>{
      matCustom.style.display = matSel.value === 'ALTRO' ? 'block' : 'none';
    });

    // Color picker events
    item.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        item.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  }

  container.addEventListener('input', updatePurchaseTotal);
  container.addEventListener('change', updatePurchaseTotal);
}

function updatePurchaseTotal(){
  const shippingCost = Number(String(document.getElementById("purchase-shipping").value).replace(",",".")) || 0;
  let spoolsCost = 0;
  
  for (let i = 0; i < state.purchaseSpoolCount; i++) {
    const costEl = document.getElementById(`pur-cost-${i}`);
    if (costEl && costEl.value) {
      spoolsCost += Number(String(costEl.value).replace(",",".")) || 0;
    }
  }
  
  const total = spoolsCost + shippingCost;
  document.getElementById("purchase-total-value").textContent = formatCurrency(total);
}

async function onAddPurchase(ev){
  ev.preventDefault();

  const shippingCost = Number(String(document.getElementById("purchase-shipping").value).replace(",",".")) || 0;
  const spoolsData = [];
  
  for (let i = 0; i < state.purchaseSpoolCount; i++) {
    let material = document.getElementById(`pur-material-${i}`)?.value || "PLA";
    if (material === 'ALTRO') material = String(document.getElementById(`pur-material-custom-${i}`)?.value||"").trim() || "Altro";
    const brand = String(document.getElementById(`pur-brand-${i}`)?.value || "").trim();
    const grams = Number(document.getElementById(`pur-grams-${i}`)?.value) || 1000;
    const cost = Number(String(document.getElementById(`pur-cost-${i}`)?.value || "0").replace(",",".")) || 0;
    
    const colorEl = document.querySelector(`#pur-color-${i} .color-option.selected`);
    const color = colorEl?.dataset.color || "#888888";
    const colorName = colorEl?.dataset.name || "Nero";
    
    if (cost <= 0) return alert(`Inserisci il costo per la bobina ${i + 1}`);
    
    spoolsData.push({ material, brand, color, colorName, grams, cost });
  }
  
  const dInp = document.getElementById("purchase-date");
  const d = dInp && dInp.value ? new Date(dInp.value) : new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
  
  // Calcola totale
  const totalSpoolsCost = spoolsData.reduce((sum, s) => sum + s.cost, 0);
  const total = totalSpoolsCost + shippingCost;
  
  // Aggiungi bobine al magazzino
  await DB.addMultipleSpools(spoolsData, shippingCost);
  
  // Registra movimento di acquisto
  await DB.addMovement({
    username: state.username,
    type: 'purchase',
    amount: -total,
    description: `Acquisto ${spoolsData.length} bobina/e`,
    itemName: spoolsData.map(s => `${s.material} ${s.colorName}`).join(", "),
    customer: '',
    date: iso,
    archived: false,
    shippingCost
  });
  
  // Reset form
  document.getElementById("purchase-shipping").value = "0";
  document.getElementById("purchase-date").valueAsDate = new Date();
  state.purchaseSpoolCount = 1;
  const spoolDisplay = document.getElementById("spool-count-display");
  if (spoolDisplay) spoolDisplay.textContent = "1";
  renderPurchaseSpools();
  updatePurchaseTotal();
  
  await refreshMovements();
  await refreshSpools();
  await refreshSpoolStats();
  if (state.currentPage === "page-analisi") renderAnalytics();
}

/* ===== MOVIMENTS LIST ===== */
async function refreshMovements(){
  const filter = document.getElementById("mov-filter").value;
  const showArch = document.getElementById("mov-show-arch").checked;
  const list = document.getElementById("mov-list"); list.innerHTML="";
  const rows = await DB.listMovements(state.username, filter, showArch);
  
  let saldo = 0;
  for (const m of rows) if (!m.archived && m.type !== 'purchase') saldo += m.amount;
  
  document.getElementById("saldo").innerHTML = `<strong>${formatCurrency(saldo)}</strong>`;

  for (const m of rows){
    const li = document.createElement("li"); 
    if (m.archived) li.classList.add("archived");
    
    const left = document.createElement("div");
    left.className = "item-main";
    
    const dateStr = new Intl.DateTimeFormat("it-IT").format(new Date(m.date));
    const amountStr = formatCurrency(Math.abs(m.amount));
    const typeBadge = `<span class="badge ${m.type}">${m.type === 'sale' ? 'Vendita' : m.type === 'expense' ? 'Spesa' : 'Acquisto'}</span>`;
    
    let mainInfo = "";
    if (m.type === 'sale') {
      mainInfo = `<div class="item-title"><strong>${m.itemName || 'Vendita'}</strong> ${m.customer ? `• ${m.customer}` : ''}</div>`;
    } else if (m.type === 'expense') {
      mainInfo = `<div class="item-title"><strong>${m.description || 'Spesa'}</strong></div>`;
    } else {
      mainInfo = `<div class="item-title"><strong>${m.itemName || 'Acquisto materiale'}</strong></div>`;
    }
    
    // Filament summary + expand panel
    const filamentList = (m.filaments && m.filaments.length > 0)
      ? m.filaments
      : (m.spoolId && m.gramsUsed ? [{spoolId: m.spoolId, gramsUsed: m.gramsUsed, cost: m.materialCost}] : []);
    const hasFilaments = m.type === 'sale' && filamentList.length > 0;

    let filamentSummary = "";
    let filamentPanel = "";
    if (hasFilaments) {
      if (filamentList.length === 1) {
        const sp = _spoolsCache.find(s=>s.id===filamentList[0].spoolId);
        filamentSummary = `<div class="item-meta">🧵 ${sp ? sp.name||sp.material : '#'+filamentList[0].spoolId} • ${filamentList[0].gramsUsed}g • ${formatCurrency(filamentList[0].cost||0)}</div>`;
      } else {
        const tg = filamentList.reduce((s,f)=>s+(f.gramsUsed||0),0);
        filamentSummary = `<div class="item-meta">🧵 ${filamentList.length} filamenti • ${tg}g • ${formatCurrency(m.materialCost||0)} — <span class="expand-hint">tocca per dettagli</span></div>`;
      }
      const detailRows = filamentList.map(f=>{
        const sp = _spoolsCache.find(s=>s.id===f.spoolId);
        return `<div class="fdl-row"><span class="fdl-name">${sp ? sp.name||sp.material : '#'+f.spoolId}</span><span class="fdl-grams">${f.gramsUsed}g</span><span class="fdl-cost">${formatCurrency(f.cost||0)}</span></div>`;
      }).join('');
      filamentPanel = `<div class="filament-detail-panel"><div class="fdl-list">${detailRows}</div><p class="fdl-note">⚠️ Modificare i materiali non aggiorna il magazzino bobine.</p><button type="button" class="btn-edit-filaments">✏️ Modifica materiali</button></div>`;
    }

    left.innerHTML = `
      ${typeBadge}
      ${mainInfo}
      <div class="item-sub">${m.description || ''} • ${dateStr}</div>
      ${filamentSummary}
      ${filamentPanel}
    `;

    if (hasFilaments) {
      li.classList.add("expandable");
      left.addEventListener("click", (e)=>{ if (!e.target.closest("button") && !e.target.closest(".filament-detail-panel")) li.classList.toggle("expanded"); });
      const btnEF = left.querySelector(".btn-edit-filaments");
      if (btnEF) btnEF.addEventListener("click", (e)=>{ e.stopPropagation(); showFilamentEditor(li, m); });
    }

    const right = document.createElement("div"); 
    right.className="item-actions";
    
    const amountEl = document.createElement("div");
    amountEl.style.cssText = `font-weight:600; font-size:1rem; ${m.type === 'sale' ? 'color:var(--success)' : 'color:var(--danger)'}`;
    amountEl.textContent = (m.type === 'sale' ? '+' : '-') + amountStr;
    
    const mkBtn = (title,icon,handler)=>{
      const b=document.createElement("button");
      b.className="icon-btn icon-only"; b.title=title; b.setAttribute("aria-label",title);
      b.appendChild($ico(icon)); b.addEventListener("click",handler); return b;
    };

    const btnEdit = mkBtn("Modifica","edit", async()=>{
      const itemRaw = prompt("Oggetto:", m.itemName ?? "");
      if (itemRaw === null) return;
      const descRaw = prompt("Descrizione:", m.description ?? "");
      if (descRaw === null) return;
      const amtRaw  = prompt("Importo:", String(Math.abs(Number(m.amount)||0)));
      if (amtRaw === null) return;

      const item = String(itemRaw).trim();
      const desc = String(descRaw).trim();
      const amt  = Number(String(amtRaw).replace(",", "."));
      if (!item) return alert("Oggetto obbligatorio.");
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
      if (!confirm("Eliminare definitivamente?")) return;
      await DB.deleteMovement(m.id);
      await refreshMovements(); if (state.currentPage==="page-analisi") renderAnalytics();
    });

    right.append(amountEl, btnEdit, btnArch, btnDel);
    li.append(left, right); list.appendChild(li);
  }

  await refreshSpoolCache();
}

async function refreshSpoolCache(){
  const spools = await DB.listSpools();
  _spoolsCache = spools;
  const opts = buildSpoolOptions(spools);
  document.querySelectorAll(".filament-spool").forEach(sel=>{
    const prev = sel.value;
    sel.innerHTML = opts;
    if (prev) sel.value = prev;
  });
  if (!document.querySelector(".filament-row")) addFilamentRow();
}

/* ===== FILAMENT EDITOR ===== */
function showFilamentEditor(li, m){
  const panel = li.querySelector(".filament-detail-panel");
  if (!panel) return;
  const filamentList = (m.filaments && m.filaments.length > 0)
    ? m.filaments
    : (m.spoolId && m.gramsUsed ? [{spoolId: m.spoolId, gramsUsed: m.gramsUsed, cost: m.materialCost}] : []);
  const spoolOpts = _spoolsCache.map(s=>`<option value="${s.id}">${s.name||s.material}${s.brand?' - '+s.brand:''} • ${s.grams_available}g</option>`).join('');
  const rows = filamentList.map((f,idx)=>`
    <div class="feditor-row">
      <select class="feditor-spool" data-idx="${idx}"><option value="">— nessuno —</option>${spoolOpts}</select>
      <input class="feditor-grams" type="number" step="1" min="1" value="${f.gramsUsed||''}" placeholder="g" data-idx="${idx}">
    </div>`).join('');
  panel.innerHTML = `<div class="filament-editor">${rows}<p class="fdl-note">⚠️ Modificare i materiali non aggiorna il magazzino bobine.</p><div class="feditor-actions"><button type="button" class="btn-feditor-save">Salva</button><button type="button" class="btn-feditor-cancel">Annulla</button></div></div>`;
  filamentList.forEach((f,idx)=>{ const s=panel.querySelector(`.feditor-spool[data-idx="${idx}"]`); if(s&&f.spoolId) s.value=String(f.spoolId); });
  panel.querySelector(".btn-feditor-cancel").addEventListener("click",(e)=>{ e.stopPropagation(); refreshMovements(); });
  panel.querySelector(".btn-feditor-save").addEventListener("click", async(e)=>{
    e.stopPropagation();
    const newFilaments = filamentList.map((_,idx)=>{
      const spoolId = Number(panel.querySelector(`.feditor-spool[data-idx="${idx}"]`)?.value)||null;
      const gramsUsed = Number(panel.querySelector(`.feditor-grams[data-idx="${idx}"]`)?.value)||0;
      const sp = _spoolsCache.find(s=>s.id===spoolId);
      return {spoolId, gramsUsed, cost: sp ? sp.price_per_kg*(gramsUsed/1000) : 0};
    }).filter(f=>f.spoolId && f.gramsUsed>0);
    const totalMaterialCost = newFilaments.reduce((s,f)=>s+f.cost,0);
    const primary = newFilaments[0]||null;
    await DB.editMovement(m.id,{filaments:newFilaments, spoolId:primary?.spoolId||null, gramsUsed:primary?.gramsUsed||0, materialCost:totalMaterialCost});
    await refreshMovements();
    if(state.currentPage==="page-analisi") renderAnalytics();
  });
}

/* ===== WAREHOUSE ===== */
function onAddSpoolManual(){
  switchPage("page-movimenti");
  switchFormTab("purchase");
}

async function refreshSpools(){
  const list = document.getElementById("spool-list"); list.innerHTML="";
  const rows = await DB.listSpools(true);
  for (const s of rows){
    const li = document.createElement("li"); 
    if (s.archived) li.classList.add("archived");
    
    const left = document.createElement("div");
    left.className = "item-main";
    
    const colorBox = `<span class="spool-color" style="background:${s.color || '#888'}"></span>`;
    left.innerHTML = `
      <div class="item-title">${colorBox} <strong>${s.name || s.material}</strong> ${s.brand ? `- ${s.brand}` : ''}</div>
      <div class="item-sub">${s.material} • ${s.grams_available}g disponibili • €${Number(s.price_per_kg).toFixed(2)}/kg</div>
    `;
    
    const right = document.createElement("div"); 
    right.className = "item-actions";

    const mkBtn = (title,icon,handler)=>{ const b=document.createElement("button"); b.className="icon-btn icon-only"; b.title=title; b.appendChild($ico(icon)); b.addEventListener("click",handler); return b; };

    const edit = mkBtn("Modifica","edit",async()=>{ 
      const name=prompt("Nome:",s.name)??s.name; 
      const price=Number(prompt("Prezzo €/kg:",String(s.price_per_kg)))||s.price_per_kg; 
      const grams=Number(prompt("Grammi:",String(s.grams_available)))||s.grams_available;
      await DB.editSpool(s.id,{name:String(name||"").trim(),price_per_kg:price,grams_available:grams}); 
      refreshSpools();
      refreshSpoolStats();
    });
    const tog  = mkBtn(s.archived?"Ripristina":"Termina bobina", s.archived?"undo":"archive", async()=>{
      if(s.archived){ await DB.editSpool(s.id,{archived:false}); }
      else {
        if (!confirm(`Terminare la bobina "${s.name||s.material}"?\nNon apparirà più nel magazzino.`)) return;
        await DB.archiveSpool(s.id);
      }
      refreshSpools();
      refreshSpoolStats();
    });

    right.append(edit,tog); li.append(left,right); list.appendChild(li);
  }
  await refreshSpoolCache();
}

async function refreshSpoolStats(){
  const stats = await DB.getSpoolStats();
  document.getElementById("spool-total-count").textContent = stats.totalSpools;
  document.getElementById("spool-total-grams").textContent = formatGrams(stats.totalGrams);
  document.getElementById("spool-total-value").textContent = formatCurrency(stats.totalValue);
  document.getElementById("spool-main-material").textContent = stats.mostMaterial.name;
}

/* ===== TO-DO ===== */
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
    if (t.priority) li.classList.add("prio-"+t.priority.replace(/_/g,"-"));

    const left = document.createElement("div");
    const prTxt = { "very-high":"Molto alta", "high":"Alta", "normal":"Normale", "low":"Bassa" }[t.priority] || t.priority || "Normale";
    left.innerHTML = `<div><strong>${t.description||"(senza testo)"}</strong></div><div class="item-sub">Priorità: ${prTxt}</div>`;

    const right = document.createElement("div"); right.className="item-actions";
    const mkBtn = (title,icon,handler)=>{ const b=document.createElement("button"); b.className="icon-btn icon-only"; b.title=title; b.setAttribute("aria-label",title); b.appendChild($ico(icon)); b.addEventListener("click",handler); return b; };

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!t.done;
    chk.addEventListener("change", async ()=>{
      await DB.toggleTask(t.id, chk.checked);
      refreshTodos();
    });

    const edit = mkBtn("Modifica","edit", async ()=>{
      const newDescRaw = prompt("Modifica:", t.description ?? "");
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
    const del  = mkBtn("Elimina","trash", async()=>{ if (confirm("Eliminare?")){ await DB.deleteTask(t.id); refreshTodos(); } });

    right.append(chk, edit, arch, del);
    li.append(left,right); list.appendChild(li);
  }
}

async function archiveDoneTodos(){
  const items = await DB.listTasks(state.username,true);
  for (const t of items){ if (t.done && !t.archived) await DB.archiveTask(t.id); }
  refreshTodos();
}

/* ===== ANALISI ===== */
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

  const stats = await DB.getMovementStats(state.username, start, end);
  const mostUsed = await DB.getMostUsedMaterial(state.username);

  // Update stats
  document.getElementById("stat-entrata").textContent = formatCurrency(stats.totalSales);
  document.getElementById("stat-uscita").textContent = formatCurrency(stats.totalExpenses);
  document.getElementById("stat-saldo").textContent = formatCurrency(stats.totalSales - stats.totalExpenses);
  
  document.getElementById("stat-bobine").textContent = stats.countPurchases;
  document.getElementById("stat-materiale").textContent = formatCurrency(stats.totalMaterialCost);
  document.getElementById("stat-spedizione").textContent = formatCurrency(stats.totalShipping);
  document.getElementById("stat-totale-filamento").textContent = formatCurrency(stats.totalPurchases + stats.totalShipping);
  
  document.getElementById("stat-stampe").textContent = stats.totalPrints;
  document.getElementById("stat-grammi-usati").textContent = formatGrams(stats.totalGramsUsed);
  
  document.getElementById("stat-profitto").textContent = formatCurrency(stats.profit);
  document.getElementById("stat-profitto").style.color = stats.profit >= 0 ? 'var(--success)' : 'var(--danger)';
  
  document.getElementById("stat-materiale-piu-usato").textContent = mostUsed.material.name;
  document.getElementById("stat-marca-piu-usata").textContent = mostUsed.brand.name;

  // Prepare chart data
  const data = rows.map(r=>({...r, d:new Date(r.date)}))
                   .filter(r=> r.d >= start && r.d <= new Date(end.getTime()+86400000-1))
                   .sort((a,b)=>a.d-b.d);

  const byDay = { sales: {}, expenses: {}, purchases: {}, materialCost: {} };
  for (const r of data){
    const key = toUTC0(r.d).toISOString();
    if (r.type === 'sale' || r.amount > 0) {
      byDay.sales[key] = (byDay.sales[key] || 0) + (r.amount || 0);
      byDay.materialCost[key] = (byDay.materialCost[key] || 0) + (r.materialCost || 0);
    } else if (r.type === 'expense') {
      byDay.expenses[key] = (byDay.expenses[key] || 0) + Math.abs(r.amount || 0);
    } else if (r.type === 'purchase') {
      byDay.purchases[key] = (byDay.purchases[key] || 0) + Math.abs(r.amount || 0);
    }
  }

  const allDays = [...new Set([...Object.keys(byDay.sales), ...Object.keys(byDay.expenses), ...Object.keys(byDay.purchases)])].sort();

  const chartData = allDays.map(k => ({
    date: new Date(k),
    sales: byDay.sales[k] || 0,
    expenses: byDay.expenses[k] || 0,
    purchases: byDay.purchases[k] || 0,
    materialCost: byDay.materialCost[k] || 0
  }));

  // Draw charts
  if (typeof drawCashFlowChart === 'function') {
    drawCashFlowChart(document.getElementById("chart-cashflow"), chartData);
  }
  if (typeof drawProfitChart === 'function') {
    drawProfitChart(document.getElementById("chart-profit"), chartData, stats.totalMaterialCost);
  }
}

/* ===== EXPORT/IMPORT ===== */
async function onExport(){
  const data = await DB.exportAll(state.username);
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:`marketspace_${state.username}_${new Date().toISOString().slice(0,10)}.json`});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function onImport(file){
  if(!file) return;
  if(!confirm("Attenzione: l'importazione sostituirà tutti i dati esistenti (movimenti, bobine, task). Continuare?")) return;
  try{
    const ok = await DB.importAll(state.username, JSON.parse(await file.text()));
    if (!ok) return alert("File non valido o checksum errato.");
    await refreshMovements(); await refreshTodos();
    await refreshSpools(); await refreshSpoolStats();
    if(state.currentPage==="page-analisi") renderAnalytics();
    alert("Backup importato con successo.");
  }catch{ alert("Errore nel parsing del file."); }
}

/* ===== RECOVERY ===== */
async function recoverUnarchiveAll(){
  const [movs, tasks] = await Promise.all([
    DB.listMovements(state.username,"all",true),
    DB.listTasks(state.username,true)
  ]);
  for (const m of movs){ if (m.archived) await DB.unarchiveMovement(m.id); }
  for (const t of tasks){ if (t.archived) await DB.unarchiveTask(t.id); }
}

/* ===== HELPERS ===== */
function formatCurrency(amount){
  return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(amount || 0);
}

function formatGrams(grams){
  if (grams >= 1000) {
    return (grams / 1000).toFixed(2) + "kg";
  }
  return grams + "g";
}
