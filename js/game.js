'use strict';

// Game state machine: 'menu' | 'play' | 'over'
let state = 'menu';
let bodies = [];
let score = 0;
let merges = 0;
let biggest = 0;
let nextType = 0;
let holdType = 0;
let holdX = W / 2;
let canDrop = true;
let dropTimer = 0;
let gameTime = 0;
let dangerPulse = 0;
let overReason = '';
let lastMergeFlash = 0;

function randDropType() {
  // Slight bias toward smaller orbs
  const weights = [];
  for (let i = 0; i < DROP_TYPES; i++) weights.push(DROP_TYPES - i);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}

function resetRun() {
  bodies = [];
  score = 0;
  merges = 0;
  biggest = 0;
  nextType = randDropType();
  holdType = randDropType();
  holdX = (BIN.left + BIN.right) / 2;
  canDrop = true;
  dropTimer = 0;
  gameTime = 0;
  overReason = '';
  clearParticles();
}

function startGame() {
  resetRun();
  state = 'play';
  if (typeof sfxClick === 'function') sfxClick();
  if (typeof ensureAudio === 'function') ensureAudio();
}

function clampHoldX(x, type) {
  const r = ORBS[type].r;
  return Math.max(BIN.left + r, Math.min(BIN.right - r, x));
}

/** Drop the held orb. Returns true if a body was spawned. */
function dropOrb() {
  if (state !== 'play' || !canDrop) return false;
  if (bodies.length >= MAX_BODIES) return false;

  const type = holdType;
  const x = clampHoldX(holdX, type);
  const y = DROP_Y;
  const b = makeBody(type, x, y, { dropped: true });
  b.born = 0;
  bodies.push(b);

  holdType = nextType;
  nextType = randDropType();
  canDrop = false;
  dropTimer = DROP_COOLDOWN;
  if (typeof sfxDrop === 'function') sfxDrop();
  return true;
}

function applyMerges() {
  const pairs = findMerges(bodies);
  if (!pairs.length) return;

  for (const [a, b] of pairs) {
    if (!a.alive || !b.alive) continue;
    a.alive = false;
    b.alive = false;

    const newType = a.type + 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const child = makeBody(newType, mx, my);
    child.born = 0;
    child.vx = (a.vx + b.vx) * 0.25;
    child.vy = Math.min(0, (a.vy + b.vy) * 0.25) - 40;
    child.mergeLock = MERGE_COOLDOWN;
    bodies.push(child);

    const pts = ORBS[newType].score;
    score += pts;
    merges += 1;
    if (newType > biggest) biggest = newType;

    if (typeof spawnPop === 'function') {
      spawnPop(mx, my, ORBS[newType].glow, ORBS[newType].r);
    }
    if (typeof sfxMerge === 'function') sfxMerge(newType);
    lastMergeFlash = 0.18;
  }

  bodies = bodies.filter(b => b.alive);
}

/** True when any part of the orb is above the danger line (smaller y). */
function isAboveDangerLine(b) {
  return (b.y - b.r) < DANGER_Y;
}

/**
 * True when the orb is resting enough to count toward a loss.
 * Uses a lenient speed cap — dense piles micro-jitter and never hit
 * physics `settled` (speed < SLEEP_SPEED), which used to prevent game over.
 */
function isRestingForDanger(b) {
  if (b.settled) return true;
  return speed(b) < DANGER_STILL;
}

function checkDanger(dt) {
  let anyDanger = false;
  for (const b of bodies) {
    if (!b.alive) continue;

    // Fresh drops spawn above the line while falling — never count them yet.
    if ((b.age || 0) < DANGER_GRACE || b.born < 0.6) {
      b.dangerTimer = 0;
      continue;
    }

    if (isAboveDangerLine(b)) {
      anyDanger = true;
      // Resting on the pile past the line → fill the lose timer.
      // Still flying upward after a bounce → tick slower, but do NOT reset
      // (resetting on jitter was why full bins never ended).
      if (isRestingForDanger(b)) {
        b.dangerTimer = (b.dangerTimer || 0) + dt;
      } else {
        b.dangerTimer = (b.dangerTimer || 0) + dt * 0.35;
      }
      if (b.dangerTimer >= DANGER_HOLD) {
        endGame('The bin overflowed!');
        return;
      }
    } else {
      // Clearly below the line — clear.
      b.dangerTimer = 0;
    }
  }
  if (anyDanger) dangerPulse += dt;
  else dangerPulse = 0;
}

function endGame(reason) {
  if (state !== 'play') return;
  state = 'over';
  overReason = reason || 'Game over';
  if (typeof sfxGameOver === 'function') sfxGameOver();
  recordGameEnd(score, biggest, merges);
  updateMenuStats();
}

function updatePlay(dt) {
  gameTime += dt;
  if (dropTimer > 0) {
    dropTimer -= dt;
    if (dropTimer <= 0) canDrop = true;
  }
  // Also unlock drop once the newest piece has settled a bit
  if (!canDrop && bodies.length) {
    const last = bodies[bodies.length - 1];
    if (last && last.settled && last.y > DROP_Y + last.r + 10) {
      canDrop = true;
      dropTimer = 0;
    }
  }

  stepPhysics(bodies, dt);
  applyMerges();
  // Second merge pass catches chains in same frame
  applyMerges();
  if (typeof updateParticles === 'function') updateParticles(dt);
  checkDanger(dt);

  if (lastMergeFlash > 0) lastMergeFlash -= dt;
}

function updateMenuStats() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  const bestEl = document.getElementById('statBest');
  const gamesEl = document.getElementById('statGames');
  const bigEl = document.getElementById('statBiggest');
  if (bestEl) bestEl.textContent = String(save.best);
  if (gamesEl) gamesEl.textContent = String(save.games);
  if (bigEl) {
    formatBiggestLabel(bigEl, save.biggest);
  }
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn) muteBtn.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
}

function screenToStage(clientX, clientY, cv) {
  const rect = cv.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * W;
  const y = ((clientY - rect.top) / rect.height) * H;
  return { x, y };
}

/**
 * Show biggest orb as colored name (same identity kids see on the balls).
 * @param {HTMLElement} el
 * @param {number} type
 */
function formatBiggestLabel(el, type) {
  if (!el) return;
  if (!(type > 0) || !ORBS[type]) {
    el.textContent = '—';
    el.style.color = '';
    return;
  }
  const def = ORBS[type];
  el.textContent = def.label;
  el.style.color = def.color;
}
