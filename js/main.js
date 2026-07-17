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
  // Flush any SW update that waited for the run to end.
  if (window.__pendingReload) {
    window.__pendingReload = false;
    window.__reloaded = true;
    location.reload();
  }
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
  // Flush any SW update that waited for the run to end.
  if (window.__pendingReload) {
    window.__pendingReload = false;
    window.__reloaded = true;
    location.reload();
  }
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

// ---------- version UI ----------
function applyVersionLabels() {
  const label = GAME_NAME + ' ' + GAME_VERSION_LABEL;
  const tag = document.getElementById('versionTag');
  const menu = document.getElementById('versionMenu');
  const over = document.getElementById('versionOver');
  if (tag) tag.textContent = label;
  if (menu) menu.textContent = label + ' · PWA ready';
  if (over) over.textContent = label;
}

// ---------- PWA + auto-update (same pattern as VoidRush / hole-game) ----------
function safeReloadForUpdate() {
  if (window.__reloaded) return;
  // Don't yank the player mid-run; reload from menu / game-over only.
  if (state === 'play') {
    window.__pendingReload = true;
    return;
  }
  window.__reloaded = true;
  location.reload();
}

function activateWaitingWorker(reg) {
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

function watchInstallingWorker(reg) {
  const worker = reg.installing;
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1')) return;

  navigator.serviceWorker.register('./sw.js').then(reg => {
    activateWaitingWorker(reg);
    if (reg.installing) watchInstallingWorker(reg);
    reg.addEventListener('updatefound', () => watchInstallingWorker(reg));

    const checkForUpdate = () => { reg.update().catch(() => {}); };
    checkForUpdate();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdate();
    });
    window.addEventListener('focus', checkForUpdate);
    setInterval(checkForUpdate, 60 * 1000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      safeReloadForUpdate();
    });
  }).catch(err => console.warn('[sw] register failed', err));

  // Hard fallback: if shell is stale but network has a newer GAME_VERSION, reload.
  function checkRemoteVersion() {
    if (state === 'play') return;
    fetch('js/config.js', { cache: 'no-store' })
      .then(r => r.ok ? r.text() : '')
      .then(text => {
        const m = text.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (m && m[1] && m[1] !== GAME_VERSION) safeReloadForUpdate();
      })
      .catch(() => {});
  }
  checkRemoteVersion();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkRemoteVersion();
  });
  setInterval(checkRemoteVersion, 2 * 60 * 1000);
}

// boot
applyVersionLabels();
updateMenuStats();
setScreen('menu');
registerSW();
({ ctx } = resizeCanvas(cv));
requestAnimationFrame(t => { last = t; frame(t); });
