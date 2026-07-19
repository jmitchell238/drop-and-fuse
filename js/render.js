'use strict';

function resizeCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // Fit 390×700 stage into available space, letterboxed
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const scale = Math.min(maxW / W, maxH / H);
  const cssW = Math.floor(W * scale);
  const cssH = Math.floor(H * scale);
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  cv.width = Math.floor(W * dpr);
  cv.height = Math.floor(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, scale, cssW, cssH };
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1024');
  g.addColorStop(0.5, '#0d1530');
  g.addColorStop(1, '#080c18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft neon washes
  const a = ctx.createRadialGradient(80, 80, 10, 80, 80, 220);
  a.addColorStop(0, 'rgba(61,231,255,0.12)');
  a.addColorStop(1, 'rgba(61,231,255,0)');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, W, H);

  const b = ctx.createRadialGradient(W - 40, H - 80, 10, W - 40, H - 80, 260);
  b.addColorStop(0, 'rgba(255,79,216,0.1)');
  b.addColorStop(1, 'rgba(255,79,216,0)');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, W, H);
}

function drawBin(ctx, dangerPulse) {
  const x = BIN.left - WALL;
  const y = BIN.top;
  const w = BIN_W + WALL * 2;
  const h = BIN_H;

  // glass panel
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();

  // inner edge highlight
  ctx.strokeStyle = 'rgba(61,231,255,0.22)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, BIN.left, BIN.top + 2, BIN_W, BIN_H - 4, 12);
  ctx.stroke();

  // floor lip
  ctx.fillStyle = 'rgba(61,231,255,0.08)';
  ctx.fillRect(BIN.left, BIN.bottom - 6, BIN_W, 6);

  // danger line
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(dangerPulse * 6));
  ctx.save();
  ctx.strokeStyle = `rgba(255,90,120,${0.35 + pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(BIN.left + 6, DANGER_Y);
  ctx.lineTo(BIN.right - 6, DANGER_Y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(255,100,130,${0.55 + pulse * 0.3})`;
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DANGER', BIN.left + 10, DANGER_Y - 6);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawOrb(ctx, body, ghost = false) {
  const def = ORBS[body.type];
  const scale = ghost ? 1 : (0.55 + 0.45 * (body.born || 1));
  const r = body.r * scale;
  const x = body.x;
  const y = body.y;

  ctx.save();
  if (ghost) ctx.globalAlpha = 0.55;

  // outer glow
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.35);
  glow.addColorStop(0, def.glow + '55');
  glow.addColorStop(0.55, def.glow + '18');
  glow.addColorStop(1, def.glow + '00');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // body
  const g = ctx.createRadialGradient(
    x - r * 0.35, y - r * 0.4, r * 0.1,
    x, y, r
  );
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.18, def.color);
  g.addColorStop(0.75, def.glow);
  g.addColorStop(1, shade(def.glow, -40));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // rim
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.stroke();

  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Name on mid/large orbs (same names used on the end screen — no mystery numbers).
  // Small orbs stay pure color so kids match by look, not by reading.
  if (!ghost && r >= 28 && def.label) {
    ctx.fillStyle = 'rgba(10,14,28,0.42)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (r >= 48) {
      const size = Math.min(15, Math.max(10, r * 0.28));
      ctx.font = `800 ${size}px system-ui,sans-serif`;
      ctx.fillText(def.label, x, y + 1);
    } else {
      // First letter only when the full name won't fit
      ctx.font = `800 ${Math.max(11, r * 0.38)}px system-ui,sans-serif`;
      ctx.fillText(def.label.charAt(0), x, y + 1);
    }
  }

  ctx.restore();
}

function shade(hex, amt) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3
    ? n.split('').map(c => c + c).join('')
    : n, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function drawHud(ctx, score, best, nextType) {
  // score pill
  ctx.fillStyle = 'rgba(8,12,24,0.55)';
  roundRect(ctx, 14, 14, 140, 54, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(148,160,194,0.95)';
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 28, 32);
  ctx.fillStyle = '#fff';
  ctx.font = '800 22px system-ui,sans-serif';
  ctx.fillText(String(score), 28, 54);

  // best
  ctx.fillStyle = 'rgba(8,12,24,0.55)';
  roundRect(ctx, W - 154, 14, 140, 54, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(148,160,194,0.95)';
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('BEST', W - 28, 32);
  ctx.fillStyle = '#ffd56a';
  ctx.font = '800 22px system-ui,sans-serif';
  ctx.fillText(String(best), W - 28, 54);

  // next orb indicator (center top)
  ctx.fillStyle = 'rgba(8,12,24,0.55)';
  roundRect(ctx, W / 2 - 48, 16, 96, 50, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(148,160,194,0.95)';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXT', W / 2, 30);
  const preview = { type: nextType, x: W / 2, y: 48, r: Math.min(14, ORBS[nextType].r * 0.55), born: 1 };
  drawOrb(ctx, preview, false);
}

function drawGuide(ctx, x, type) {
  const def = ORBS[type];
  const r = def.r;
  ctx.save();
  // Straight drop path — makes it obvious shots are not angled
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(x, DROP_Y + r + 4);
  ctx.lineTo(x, BIN.bottom - 4);
  ctx.stroke();
  ctx.setLineDash([]);

  // Name under the ghost so kids connect color ↔ name while aiming
  if (def.label) {
    ctx.fillStyle = 'rgba(200, 210, 240, 0.7)';
    ctx.font = '700 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(def.label, x, DROP_Y + r + 8);
  }
  ctx.restore();
}
