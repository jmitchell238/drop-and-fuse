'use strict';

const cv = document.getElementById('cv');
const stage = document.getElementById('stage');
let ctx = null;
let last = performance.now();
let pointerDown = false;
let aiming = false;
let activePointerId = null;

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('hidden', el.dataset.screen !== name);
  });
  // Play chrome is not a .screen (full-screen overlays break iPad canvas hits)
  document.querySelectorAll('.play-chrome').forEach(el => {
    el.classList.toggle('hidden', name !== 'play');
  });
}

function showMenu() {
  state = 'menu';
  aiming = false;
  pointerDown = false;
  activePointerId = null;
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
  aiming = false;
  pointerDown = false;
  activePointerId = null;
  setScreen('play');
}

function showOver() {
  aiming = false;
  pointerDown = false;
  activePointerId = null;
  setScreen('over');
  document.getElementById('overScore').textContent = String(score);
  document.getElementById('overBest').textContent = String(save.best);
  document.getElementById('overMerges').textContent = String(merges);
  formatBiggestLabel(document.getElementById('overBiggest'), biggest);
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

    const sorted = bodies.slice().sort((a, b) => a.r - b.r);
    for (const b of sorted) drawOrb(ctx, b);

    drawParticles(ctx);
    drawHud(ctx, score, Math.max(save.best, score), nextType);

    if (lastMergeFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${lastMergeFlash * 0.25})`;
      ctx.fillRect(BIN.left, BIN.top, BIN_W, BIN_H);
    }
  } else {
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

// ---------- input (pointer + touch; stage-level so nothing covers the canvas) ----------
function canvasRect() {
  return cv.getBoundingClientRect();
}

function beginAim(clientX, clientY, pointerId, target) {
  ensureAudio();
  const rect = canvasRect();
  if (!shouldBeginAim({ state, target, rect })) return false;

  const x = aimFromClient({
    clientX, clientY, rect, stageW: W, stageH: H, holdType, clampHoldX,
  });
  if (x == null) return false;

  pointerDown = true;
  aiming = true;
  activePointerId = pointerId;
  holdX = x;
  return true;
}

function moveAim(clientX, clientY, pointerId) {
  if (state !== 'play' || !aiming) return;
  if (pointerId != null && activePointerId != null && pointerId !== activePointerId) return;
  const x = aimFromClient({
    clientX, clientY, rect: canvasRect(), stageW: W, stageH: H, holdType, clampHoldX,
  });
  if (x != null) holdX = x;
}

function endAim(clientX, clientY, pointerId) {
  if (pointerId != null && activePointerId != null && pointerId !== activePointerId) return;

  if (shouldDropOnRelease({ state, aiming, canDrop })) {
    if (clientX != null && clientY != null) {
      const x = aimFromClient({
        clientX, clientY, rect: canvasRect(), stageW: W, stageH: H, holdType, clampHoldX,
      });
      if (x != null) holdX = x;
    }
    dropOrb();
  }
  pointerDown = false;
  aiming = false;
  activePointerId = null;
}

function onPointerDown(e) {
  if (beginAim(e.clientX, e.clientY, e.pointerId, e.target)) {
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* iOS may throw */ }
  }
}

function onPointerMove(e) {
  if (!aiming) return;
  e.preventDefault();
  moveAim(e.clientX, e.clientY, e.pointerId);
}

function onPointerUp(e) {
  if (!aiming && !pointerDown) return;
  e.preventDefault();
  endAim(e.clientX, e.clientY, e.pointerId);
  try { stage.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
}

function onPointerCancel(e) {
  pointerDown = false;
  aiming = false;
  activePointerId = null;
}

// Touch fallbacks: some iPad Simulator / older WebKit paths are flaky with Pointer Events only
function touchClient(e) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (!t) return null;
  return { x: t.clientX, y: t.clientY, id: t.identifier, target: e.target };
}

function onTouchStart(e) {
  const t = touchClient(e);
  if (!t) return;
  if (beginAim(t.x, t.y, t.id, t.target)) e.preventDefault();
}

function onTouchMove(e) {
  if (!aiming) return;
  const t = touchClient(e);
  if (!t) return;
  e.preventDefault();
  moveAim(t.x, t.y, t.id);
}

function onTouchEnd(e) {
  if (!aiming && !pointerDown) return;
  const t = touchClient(e);
  e.preventDefault();
  endAim(t ? t.x : null, t ? t.y : null, t ? t.id : null);
}

// Listen on STAGE (not only canvas) so hits aren't lost to sibling chrome / transforms
const ptrOpts = { passive: false };
stage.addEventListener('pointerdown', onPointerDown, ptrOpts);
stage.addEventListener('pointermove', onPointerMove, ptrOpts);
stage.addEventListener('pointerup', onPointerUp, ptrOpts);
stage.addEventListener('pointercancel', onPointerCancel, ptrOpts);
stage.addEventListener('touchstart', onTouchStart, ptrOpts);
stage.addEventListener('touchmove', onTouchMove, ptrOpts);
stage.addEventListener('touchend', onTouchEnd, ptrOpts);
stage.addEventListener('touchcancel', onPointerCancel, ptrOpts);

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
document.getElementById('btnPauseMenu').addEventListener('click', e => {
  e.stopPropagation();
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

/** Color ladder in How-to: shows same-size pairs grow into named orbs. */
function fillOrbLadder() {
  const el = document.getElementById('orbLadder');
  if (!el || typeof ORBS === 'undefined') return;
  el.innerHTML = '';
  ORBS.forEach((def, i) => {
    const step = document.createElement('span');
    step.className = 'step';
    step.title = def.label;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = def.color;
    dot.style.color = def.glow;
    const size = 10 + Math.min(10, i);
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    step.appendChild(dot);
    el.appendChild(step);
    if (i < ORBS.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      el.appendChild(arrow);
    }
  });
}

// ---------- PWA + auto-update (same pattern as VoidRush / hole-game) ----------
function safeReloadForUpdate() {
  if (window.__reloaded) return;
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
fillOrbLadder();
updateMenuStats();
setScreen('menu');
registerSW();
({ ctx } = resizeCanvas(cv));
requestAnimationFrame(t => { last = t; frame(t); });
