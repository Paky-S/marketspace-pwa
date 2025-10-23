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

  // asse X (solo ticks principali)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
  ctx.font = "12px system-ui, -apple-system, Segoe UI";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const tickCount = Math.min(6, points.length);
  for (let i=0;i<tickCount;i++){
    const idx = Math.round(i*(points.length-1)/(tickCount-1));
    const d = new Date(points[idx].x);
    const label = d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' });
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
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  const total = data.reduce((a,b)=>a + (b.value||0), 0);
  if (total <= 0){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
    ctx.font = "14px system-ui, -apple-system, Segoe UI";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("Nessun dato", w/2, h/2);
    if (opts.legendEl) opts.legendEl.innerHTML = "";
    return;
  }

  const colors = [
    getComputedStyle(document.documentElement).getPropertyValue('--accent'),
    getComputedStyle(document.documentElement).getPropertyValue('--ok'),
    "#a78bfa","#f59e0b","#ef4444","#10b981","#3b82f6"
  ];
  const cx = w/2, cy = h/2, r = Math.min(w,h)*0.36;
  let start = -Math.PI/2;

  data.forEach((d,i)=>{
    const val = d.value || 0;
    const angle = (val/total)*Math.PI*2;
    const end = start + angle;

    // fetta
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,end,false);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length].trim() || '#999';
    ctx.fill();

    // percentuale
    const mid = (start + end)/2;
    const tx = cx + Math.cos(mid) * r * 0.66;
    const ty = cy + Math.sin(mid) * r * 0.66;
    const perc = Math.round((val/total)*100);
    ctx.fillStyle = "#fff";
    ctx.font = "12px system-ui, -apple-system, Segoe UI";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(perc+"%", tx, ty);

    start = end;
  });

  // legenda
  if (opts.legendEl){
    const legend = data.map((d,i)=>{
      const perc = ((d.value/total)*100).toFixed(1).replace('.', ',');
      const color = colors[i % colors.length];
      return `
        <div class="pie-legend-item">
          <span class="swatch" style="background:${color};"></span>
          <span class="label">${d.label}</span>
          <span class="val">${perc}%</span>
        </div>`;
    }).join("");
    opts.legendEl.innerHTML = legend;
  }
}
