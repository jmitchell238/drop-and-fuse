'use strict';

const cv = document.getElementById('cv');
let ctx = null;
let last = performance.now();
let pointerDown = false;
let aiming = false;

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('hidden', el.dataset.screen !== name);
  });
}

function showMenu() {
  state = 'menu';
  updateMenuStats();
  setScreen('menu');
}

function showPlay() {
  startGame();
  setScreen('play');
}

function showOver() {
  setScreen('over');
  document.getElementById('overScore').textContent = String(score);
  document.getElementById('overBest').textContent = String(save.best);
  document.getElementById('overMerges').textContent = String(merges);
  document.getElementById('overBiggest').textContent =
    biggest > 0 ? ORBS[biggest].label : '—';
  document.getElementById('overReason').textContent = overReason;
  const isNew = score > 0 && score >= save.best;
  document.getElementById('newBest').classList.toggle('hidden', !isNew || score === 0);
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (!ctx) {
    ({ ctx } = resizeCanvas(cv));
  }

  if (state === 'play') {
    updatePlay(dt);
    if (state === 'over') showOver();
  }

  // draw
  drawBackground(ctx);
  drawBin(ctx, dangerPulse);

  if (state === 'play' || state === 'over') {
    // guide + ghost while playable
    if (state === 'play' && canDrop) {
      const gx = clampHoldX(holdX, holdType);
      drawGuide(ctx, gx, holdType);
      drawOrb(ctx, {
        type: holdType,
        x: gx,
        y: DROP_Y,
        r: ORBS[holdType].r,
        born: 1,
      }, true);
    }

    // bodies sorted by size for nicer overlap (small on top? large on top looks better)
    const sorted = bodies.slice().sort((a, b) => a.r - b.r);
    for (const b of sorted) drawOrb(ctx, b);

    drawParticles(ctx);
    drawHud(ctx, score, Math.max(save.best, score), nextType);

    // merge flash
    if (lastMergeFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${lastMergeFlash * 0.25})`;
      ctx.fillRect(BIN.left, BIN.top, BIN_W, BIN_H);
    }
  } else {
    // idle preview orbs for menu backdrop
    drawIdleDecor(ctx, now);
  }

  requestAnimationFrame(frame);
}

function drawIdleDecor(ctx, now) {
  const t = now / 1000;
  for (let i = 0; i < 6; i++) {
    const type = i % DROP_TYPES;
    const x = BIN.left + 40 + i * 52;
    const y = BIN.top + 180 + Math.sin(t * 1.2 + i) * 18 + i * 28;
    drawOrb(ctx, { type, x, y, r: ORBS[type].r, born: 1 }, false);
  }
}

// ---------- input ----------
function onPointerDown(e) {
  ensureAudio();
  if (state !== 'play') return;
  pointerDown = true;
  aiming = true;
  cv.setPointerCapture(e.pointerId);
  const p = screenToStage(e.clientX, e.clientY, cv);
  holdX = clampHoldX(p.x, holdType);
}

function onPointerMove(e) {
  if (state !== 'play' || !aiming) return;
  const p = screenToStage(e.clientX, e.clientY, cv);
  holdX = clampHoldX(p.x, holdType);
}

function onPointerUp(e) {
  if (state !== 'play') {
    pointerDown = false;
    aiming = false;
    return;
  }
  if (aiming) {
    const p = screenToStage(e.clientX, e.clientY, cv);
    holdX = clampHoldX(p.x, holdType);
    dropOrb();
  }
  pointerDown = false;
  aiming = false;
}

cv.addEventListener('pointerdown', onPointerDown);
cv.addEventListener('pointermove', onPointerMove);
cv.addEventListener('pointerup', onPointerUp);
cv.addEventListener('pointercancel', () => { pointerDown = false; aiming = false; });

// keyboard
addEventListener('keydown', e => {
  if (state !== 'play') {
    if (e.key === 'Enter' || e.key === ' ') {
      if (state === 'menu') showPlay();
      else if (state === 'over') showPlay();
    }
    return;
  }
  const step = 18;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    holdX = clampHoldX(holdX - step, holdType);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    holdX = clampHoldX(holdX + step, holdType);
  } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    dropOrb();
  } else if (e.key === 'Escape') {
    showMenu();
  }
});

addEventListener('resize', () => {
  ({ ctx } = resizeCanvas(cv));
});

// ---------- UI buttons ----------
document.getElementById('btnPlay').addEventListener('click', showPlay);
document.getElementById('btnHow').addEventListener('click', () => {
  sfxClick();
  document.getElementById('howPanel').classList.toggle('hidden');
});
document.getElementById('btnRetry').addEventListener('click', showPlay);
document.getElementById('btnMenu').addEventListener('click', () => {
  sfxClick();
  showMenu();
});
document.getElementById('btnPauseMenu').addEventListener('click', () => {
  sfxClick();
  showMenu();
});
document.getElementById('muteBtn').addEventListener('click', () => {
  save.muted = !save.muted;
  persist();
  updateMenuStats();
  sfxClick();
});

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// boot
updateMenuStats();
setScreen('menu');
({ ctx } = resizeCanvas(cv));
requestAnimationFrame(t => { last = t; frame(t); });
