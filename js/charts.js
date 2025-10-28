// charts.js — rendering canvas con dimensionamento stabile

function _prepCanvas(canvas){
  // Usa SOLO le dimensioni imposte dal CSS (clientWidth/Height).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw  = Math.max(1, canvas.clientWidth  || canvas.getBoundingClientRect().width  || 600);
  const ch  = Math.max(1, canvas.clientHeight || canvas.getBoundingClientRect().height || 280);

  // NON toccare style.width/height (evita feedback di layout).
  const bw = Math.round(cw * dpr);
  const bh = Math.round(ch * dpr);
  if (canvas.width !== bw || canvas.height !== bh){
    canvas.width = bw; canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return { ctx, w:cw, h:ch, dpr };
}

// Linea continua saldo cumulato
function drawLineChart(canvas, points, opts = {}){
  if(!canvas) return;
  const {ctx, w, h, dpr} = _prepCanvas(canvas);
  ctx.clearRect(0,0,w,h);

  const m = { l: 48, r: 16, t: 18, b: 36 };
  const iw = Math.max(1, w - m.l - m.r);
  const ih = Math.max(1, h - m.t - m.b);

  const css = getComputedStyle(document.documentElement);
  const colGrid = "rgba(127,127,127,.25)";
  const colLine = (css.getPropertyValue("--accent").trim() || "#0ea5e9");
  const colText = (css.getPropertyValue("--fg").trim()     || "#0b1215");

  ctx.font = "12px system-ui,-apple-system,Segoe UI";
  ctx.fillStyle = colText;

  if (!points || !points.length){
    ctx.fillText("Nessun dato", m.l, m.t + 14);
    return;
  }

  const xs = points.map(p=>p.x.getTime()), ys = points.map(p=>p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.08 || 1;

  const x2px = (x)=> m.l + ((x - xMin) / Math.max(1, xMax - xMin)) * iw;
  const y2px = (y)=> m.t + ih - ((y - (yMin - yPad)) / Math.max(1, (yMax - (yMin - yPad)))) * ih;

  // Griglia Y
  ctx.strokeStyle = colGrid; ctx.lineWidth = 1;
  const yt = 5;
  for (let i=0;i<=yt;i++){
    const t = i/yt;
    const yv = (yMin - yPad) + t * (yMax - (yMin - yPad));
    const y = y2px(yv);
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
    ctx.fillText(new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(yv), 6, y - 2);
  }

  // Griglia X
  const days = Math.max(1, Math.round((xMax - xMin) / 86400000));
  const xt = Math.min(6, days + 1);
  for (let i=0;i<=xt;i++){
    const xv = xMin + ((xMax - xMin) * (i/xt));
    const x = x2px(xv);
    ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
    const d = new Date(xv);
    const label = (days <= 31) ? d.getDate() : (d.getMonth()+1) + "/" + String(d.getFullYear()).slice(-2);
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, x - tw/2, h - 12);
  }

  // Assi
  ctx.beginPath();
  ctx.moveTo(m.l, h - m.b); ctx.lineTo(w - m.r, h - m.b);
  ctx.moveTo(m.l, m.t);     ctx.lineTo(m.l, h - m.b);
  ctx.stroke();

  // Linea continua
  ctx.strokeStyle = colLine; ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x = x2px(p.x.getTime()), y = y2px(p.y);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Punti
  ctx.fillStyle = colLine;
  points.forEach(p=>{
    const x = x2px(p.x.getTime()), y = y2px(p.y);
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });

  // Tooltip una sola istanza
  const parent = canvas.parentElement || canvas;
  if (!canvas._tip){
    const tip = document.createElement("div");
    tip.className = "tooltip"; tip.style.display = "none";
    canvas._tip = tip; parent.appendChild(tip);
  }
  canvas.onmousemove = ev => {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best=null, bd=1e9;
    points.forEach(p=>{
      const x=x2px(p.x.getTime()), y=y2px(p.y);
      const d=Math.hypot(mx-x,my-y); if(d<bd){bd=d; best={x,y,p};}
    });
    if(best && bd<20){
      const d = best.p.x;
      const lx = new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit"}).format(d);
      const ly = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(best.p.y);
      canvas._tip.textContent = lx + " · " + ly;
      canvas._tip.style.left = (best.x + 8) + "px";
      canvas._tip.style.top  = (best.y - 28) + "px";
      canvas._tip.style.display = "block";
    }else{
      canvas._tip.style.display = "none";
    }
  };
  canvas.onmouseleave = ()=>{ if(canvas._tip) canvas._tip.style.display="none"; };
}

/* (Se usi anche il pie) */
function drawPieChart(canvas, data, opts={}){
  if(!canvas) return;
  const {ctx, w, h} = _prepCanvas(canvas);
  ctx.clearRect(0,0,w,h);

  const total = data.reduce((s,d)=>s+d.value,0);
  if(total<=0){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || "#999";
    ctx.font = "14px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("Nessun dato", w/2, h/2);
    if(opts.legendEl) opts.legendEl.innerHTML = "";
    return;
  }

  const css = getComputedStyle(document.documentElement);
  const colors = [
    css.getPropertyValue('--accent').trim() || '#0ea5e9',
    css.getPropertyValue('--danger').trim() || '#ef4444',
    '#a78bfa','#f59e0b','#3b82f6','#10b981','#fde047'
  ];

  const cx=w/2, cy=h/2, r=Math.min(w,h)*0.40;
  let start=-Math.PI/2;
  data.forEach((d,i)=>{
    const ang = (d.value/total)*Math.PI*2;
    const end = start+ang;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
    ctx.fillStyle = colors[i%colors.length]; ctx.fill();

    const mid=(start+end)/2;
    const tx=cx+Math.cos(mid)*r*0.6, ty=cy+Math.sin(mid)*r*0.6;
    const pct = Math.round((d.value/total)*100);
    ctx.fillStyle="#fff"; ctx.font="bold 12px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(pct+"%", tx, ty);

    start=end;
  });

  if(opts.legendEl){
    opts.legendEl.innerHTML = data.map((d,i)=>{
      const pct=((d.value/total)*100).toFixed(1).replace('.',',');
      return `<div class="pie-legend-item">
        <span class="swatch" style="background:${colors[i%colors.length]}"></span>
        <span class="label">${d.label}</span>
        <span class="val">${pct}%</span>
      </div>`;
    }).join('');
  }
}
