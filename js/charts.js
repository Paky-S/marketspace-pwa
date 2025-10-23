// charts.js — funzioni grafiche canvas vanilla

function _dprCanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}

/** Line Chart: points = [{x:Date, y:Number}], opts.step=false */
function drawLineChart(canvas, points, opts={}){
  if (!canvas) return;
  const ctx = _dprCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;

  // margini
  const m = { l: 36, r: 10, t: 10, b: 24 };
  const iw = Math.max(1, w - m.l - m.r);
  const ih = Math.max(1, h - m.t - m.b);

  // scale
  const xs = points.map(p=>+p.x);
  const ys = points.map(p=>p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(0, Math.min(...ys)), yMax = Math.max(...ys, 0);
  const x2px = (x)=> m.l + (iw * ( (x - xMin) / Math.max(1, xMax - xMin) ));
  const y2px = (y)=> m.t + ih - (ih * ( (y - yMin) / Math.max(1, yMax - yMin) ));

  // sfondo
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg');
  ctx.fillRect(0,0,w,h);

  // griglia orizzontale
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i=0;i<=4;i++){
    const y = m.t + (ih * i/4);
    ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y);
  }
  ctx.stroke();

  // asse X (ticks principali)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
  ctx.font = "12px system-ui,-apple-system,Segoe UI";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const tickCount = Math.min(6, points.length);
  for (let i=0;i<tickCount;i++){
    const idx = Math.round(i*(points.length-1)/(tickCount-1));
    const d = new Date(points[idx].x);
    const label = d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
    const x = x2px(+d);
    ctx.fillText(label, x, h - m.b + 6);
  }

  // linea
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x=x2px(+p.x), y=y2px(p.y);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

/** Pie chart con percentuali e legenda */
function drawPieChart(canvas, data, opts={}){
  if (!canvas) return;
  const ctx = _dprCanvas(canvas);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
    ctx.font = "14px system-ui,-apple-system,Segoe UI";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("Nessun dato", w/2, h/2);
    if (opts.legendEl) opts.legendEl.innerHTML = "";
    return;
  }

  // palette: prima fetta colore accento, seconda fetta colore danger, poi altre tinte
  const colors = [
    getComputedStyle(document.documentElement).getPropertyValue('--accent'),
    getComputedStyle(document.documentElement).getPropertyValue('--danger'),
    '#a78bfa','#f59e0b','#3b82f6','#10b981','#fde047'
  ].map(c => c.trim());

  // centro e raggio: 40% del min(w,h) per evitare tagli
  const cx = w/2, cy = h/2;
  const r  = Math.min(w, h) * 0.40;
  let start = -Math.PI/2;

  data.forEach((d,i)=>{
    const val = d.value;
    const angle = (val/total) * 2 * Math.PI;
    const end   = start + angle;

    // fetta
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,end,false);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length] || '#999';
    ctx.fill();

    // percentuale al centro della fetta
    const mid = (start + end)/2;
    const tx = cx + Math.cos(mid) * r * 0.6;
    const ty = cy + Math.sin(mid) * r * 0.6;
    const perc = Math.round((val/total)*100);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui,-apple-system,Segoe UI";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(perc+"%", tx, ty);

    start = end;
  });

  // legenda
  if (opts.legendEl){
    const legend = data.map((d,i)=>{
      const pct = ((d.value/total)*100).toFixed(1).replace('.',',');
      const col = colors[i % colors.length];
      return `
        <div class="pie-legend-item">
          <span class="swatch" style="background:${col};"></span>
          <span class="label">${d.label}</span>
          <span class="val">${pct}%</span>
        </div>
      `;
    }).join("");
    opts.legendEl.innerHTML = legend;
  }
}
