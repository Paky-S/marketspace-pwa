// Linea cumulata con assi, tacche, tooltip; altezza fissa; step mode
function drawLineChart(canvas, points, opts={}){
  const DPR = window.devicePixelRatio || 1;
  const Wcss = canvas.clientWidth || 600;
  const Hcss = canvas.clientHeight || 280;
  const W = Wcss * DPR, H = Hcss * DPR;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,W,H);

  const padL = 48*DPR, padR = 16*DPR, padT = 18*DPR, padB = 36*DPR;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const css = getComputedStyle(document.documentElement);
  const colGrid = "rgba(127,127,127,.25)";
  const colLine = css.getPropertyValue("--accent").trim() || "#0ea5e9";
  const colText = css.getPropertyValue("--fg").trim() || "#0b1215";

  ctx.font = `${12*DPR}px system-ui`; ctx.fillStyle = colText;

  if (!points || !points.length){ ctx.fillText("Nessun dato", padL, padT+14*DPR); return; }

  const xs = points.map(p=>p.x.getTime()), ys = points.map(p=>p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const yPad = (maxY - minY) * 0.08 || 1;

  const x2px = x => padL + ((x - minX) / Math.max(1,(maxX-minX))) * plotW;
  const y2px = y => H - padB - ((y - (minY - yPad)) / Math.max(1,(maxY - (minY - yPad)))) * plotH;

  // Griglia Y
  ctx.strokeStyle = colGrid; ctx.lineWidth = 1*DPR;
  const yt = 5;
  for(let i=0;i<=yt;i++){
    const t=i/yt; const yv=(minY - yPad) + t*(maxY - (minY - yPad)); const y=y2px(yv);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(yv), 6*DPR, y-2*DPR);
  }
  // Griglia X
  const days = Math.max(1, Math.round((maxX - minX)/86400000));
  const xt = Math.min(6, days+1);
  for(let i=0;i<=xt;i++){
    const xv = minX + ((maxX-minX)*(i/xt)); const x=x2px(xv);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    const d=new Date(xv); const label = (days<=31)? d.getDate() : (d.getMonth()+1)+"/"+String(d.getFullYear()).slice(-2);
    const tw = ctx.measureText(label).width; ctx.fillText(label, x - tw/2, H - 12*DPR);
  }
  // Assi
  ctx.beginPath(); ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.stroke();

  // Linea
  ctx.strokeStyle = colLine; ctx.lineWidth = 2*DPR; ctx.beginPath();
  for(let i=0;i<points.length;i++){
    const p=points[i]; const x=x2px(p.x.getTime()), y=y2px(p.y);
    if (i===0) ctx.moveTo(x,y);
    else if (opts.step){ const prev=points[i-1]; const xPrev=x2px(prev.x.getTime()), yPrev=y2px(prev.y); ctx.lineTo(x, yPrev); ctx.lineTo(x, y); }
    else ctx.lineTo(x,y);
  }
  ctx.stroke();

  // Punti
  ctx.fillStyle = colLine; const R=3*DPR;
  points.forEach(p=>{ const x=x2px(p.x.getTime()), y=y2px(p.y); ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.fill(); });

  // Tooltip (singolo)
  if (!canvas._tip){ const tip=document.createElement("div"); tip.className="tooltip"; tip.style.display="none"; canvas._tip=tip; canvas.parentElement.appendChild(tip); }
  canvas.onmousemove = ev=>{
    const rect=canvas.getBoundingClientRect(); const mx=(ev.clientX-rect.left)*(window.devicePixelRatio||1), my=(ev.clientY-rect.top)*(window.devicePixelRatio||1);
    let best=null,bd=1e9; points.forEach(p=>{ const x=x2px(p.x.getTime()), y=y2px(p.y); const d=Math.hypot(mx-x,my-y); if(d<bd){bd=d; best={x,y,p};} });
    if(best && bd<20*(window.devicePixelRatio||1)){
      const d=best.p.x; const lx=new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit"}).format(d);
      const ly=new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(best.p.y);
      canvas._tip.textContent = lx+" · "+ly;
      canvas._tip.style.left = (best.x/(window.devicePixelRatio||1)+8)+"px";
      canvas._tip.style.top  = (best.y/(window.devicePixelRatio||1)-28)+"px";
      canvas._tip.style.display = "block";
    } else canvas._tip.style.display="none";
  };
  canvas.onmouseleave = ()=>{ if(canvas._tip) canvas._tip.style.display="none"; };
}
