#!/usr/bin/env node
/**
 * Drop & Fuse — automated tests (no browser / no deps).
 * Run: node tests/run.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    process.stdout.write('.');
    return;
  }
  failed++;
  failures.push(msg);
  console.error('\n  ✗', msg);
}

function assertEq(a, b, msg) {
  assert(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function section(name) {
  process.stdout.write('\n• ' + name + ' ');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function loadGame() {
  const files = [
    'js/config.js',
    'js/save.js',
    'js/audio.js',
    'js/physics.js',
    'js/particles.js',
    'js/input.js',
    'js/game.js',
  ];
  const code = files
    .map(rel => `// ---- ${rel} ----\n` + read(rel))
    .join('\n;\n');

  const exportFooter = `
    globalThis.__TEST__ = {
      GAME_VERSION, GAME_VERSION_LABEL, GAME_NAME,
      W, H, BIN, ORBS, DROP_Y, DROP_TYPES, DROP_COOLDOWN, MAX_TYPE, MAX_BODIES,
      DANGER_Y, DANGER_HOLD, DANGER_GRACE, DANGER_STILL, GRAVITY, MERGE_COOLDOWN, MERGE_TOUCH,
      state: () => state,
      setState: (s) => { state = s; },
      bodies: () => bodies,
      setBodies: (b) => { bodies = b; },
      score: () => score,
      merges: () => merges,
      biggest: () => biggest,
      canDrop: () => canDrop,
      holdType: () => holdType,
      holdX: () => holdX,
      setHoldX: (x) => { holdX = x; },
      setHoldType: (t) => { holdType = t; },
      dropTimer: () => dropTimer,
      overReason: () => overReason,
      dangerPulse: () => dangerPulse,
      startGame, resetRun, dropOrb, clampHoldX, updatePlay, applyMerges, endGame, checkDanger,
      isAboveDangerLine, isRestingForDanger,
      makeBody, findMerges, stepPhysics, resolveWalls, speed,
      isUiChromeTarget, clientToStage, shouldBeginAim, aimFromClient, shouldDropOnRelease,
      save, loadSave, defaultSave, recordGameEnd, persist, SAVE_KEY,
    };
  `;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    performance: { now: () => Date.now() },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    navigator: { userAgent: 'node-test' },
    module: { exports: {} },
    exports: {},
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(code + '\n' + exportFooter, ctx, { filename: 'drop-and-fuse-bundle.js' });
  return { api: ctx.__TEST__, sandbox };
}

// -------------------- tests --------------------
section('input helpers');
{
  const { api: g } = loadGame();
  assert(typeof g.shouldBeginAim === 'function', 'shouldBeginAim defined');
  assertEq(g.shouldBeginAim({ state: 'play', target: {}, rect: { width: 0, height: 0 } }), false, 'zero-size canvas');
  assertEq(g.shouldBeginAim({ state: 'menu', target: {}, rect: { width: 100, height: 200 } }), false, 'no aim on menu');
  assertEq(g.shouldBeginAim({ state: 'play', target: {}, rect: { width: 100, height: 200 } }), true, 'aim on play');

  const fakeBtn = { closest(sel) { return sel.includes('button') ? this : null; } };
  assertEq(
    g.shouldBeginAim({ state: 'play', target: fakeBtn, rect: { width: 100, height: 200 } }),
    false,
    'no aim on UI chrome'
  );

  const rect = { left: 100, top: 50, width: 390, height: 700 };
  const p = g.clientToStage(100 + 195, 50 + 350, rect, 390, 700);
  assert(p && Math.abs(p.x - 195) < 0.01 && Math.abs(p.y - 350) < 0.01, 'clientToStage center');
  assertEq(g.clientToStage(0, 0, { width: 0, height: 0 }, 390, 700), null, 'bad rect');

  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: true, canDrop: true }), true, 'drop ok');
  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: false, canDrop: true }), false, 'need aiming');
  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: true, canDrop: false }), false, 'need canDrop');
  assertEq(g.shouldDropOnRelease({ state: 'menu', aiming: true, canDrop: true }), false, 'not on menu');

  const hold = g.aimFromClient({
    clientX: 100, clientY: 50, rect, stageW: 390, stageH: 700, holdType: 0, clampHoldX: g.clampHoldX,
  });
  assert(hold != null && hold >= g.BIN.left + g.ORBS[0].r, 'aim clamps left');
}

section('first drop (iPad regression)');
{
  const { api: g } = loadGame();
  g.startGame();
  assertEq(g.state(), 'play', 'enters play');
  assertEq(g.canDrop(), true, 'can drop immediately');
  assertEq(g.bodies().length, 0, 'no bodies yet');
  assertEq(g.shouldDropOnRelease({ state: g.state(), aiming: true, canDrop: g.canDrop() }), true, 'tap-release allows drop');
  assertEq(g.dropOrb(), true, 'first drop returns true');
  assertEq(g.bodies().length, 1, 'one body');
  assertEq(g.canDrop(), false, 'cooldown after drop');
  assert(g.bodies()[0].y === g.DROP_Y, 'spawn at DROP_Y');
  assertEq(g.dropOrb(), false, 'blocked during cooldown');
  for (let i = 0; i < 30; i++) g.updatePlay(0.05);
  assertEq(g.canDrop(), true, 'cooldown cleared');
  assertEq(g.dropOrb(), true, 'second drop ok');
  assertEq(g.bodies().length, 2, 'two bodies');
}

section('physics + merge');
{
  const { api: g } = loadGame();
  g.startGame();
  const a = g.makeBody(0, g.BIN.left + 80, g.BIN.bottom - 20);
  const b = g.makeBody(0, g.BIN.left + 80 + 8, g.BIN.bottom - 20);
  a.born = 1; b.born = 1;
  g.setBodies([a, b]);
  const before = g.score();
  g.applyMerges();
  assertEq(g.bodies().length, 1, 'merge → one body');
  assertEq(g.bodies()[0].type, 1, 'type+1');
  assert(g.score() > before, 'score up');
  assertEq(g.merges(), 1, 'merge count');

  g.setBodies([g.makeBody(0, 100, 400), g.makeBody(1, 105, 400)]);
  g.bodies().forEach(x => { x.born = 1; });
  g.applyMerges();
  assertEq(g.bodies().length, 2, 'different types no merge');

  // max type does not merge further
  const m1 = g.makeBody(g.MAX_TYPE, 150, 500);
  const m2 = g.makeBody(g.MAX_TYPE, 155, 500);
  m1.born = 1; m2.born = 1;
  g.setBodies([m1, m2]);
  g.applyMerges();
  assertEq(g.bodies().length, 2, 'max tier does not merge');
}

section('merge on touch (not crush)');
{
  const { api: g } = loadGame();
  g.startGame();
  const r = g.ORBS[0].r;
  // Exact geometric touch — used to FAIL (needed 1.5px penetration)
  const a = g.makeBody(0, 160, 500);
  const b = g.makeBody(0, 160 + r * 2, 500);
  a.born = 1; b.born = 1; a.mergeLock = 0; b.mergeLock = 0;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  assert(Math.abs(dist - r * 2) < 0.01, 'fixture is exact touch');
  const pairs = g.findMerges([a, b]);
  assertEq(pairs.length, 1, 'findMerges at exact touch');
  g.setBodies([a, b]);
  g.applyMerges();
  assertEq(g.bodies().length, 1, 'touching same-type fuse');
  assertEq(g.bodies()[0].type, 1, 'touch fuse → next tier');

  // Settled side-by-side after physics (the "only when something lands on them" bug)
  g.startGame();
  const s1 = g.makeBody(1, 140, g.BIN.bottom - g.ORBS[1].r);
  const s2 = g.makeBody(1, 140 + g.ORBS[1].r * 2 + 0.5, g.BIN.bottom - g.ORBS[1].r);
  s1.born = 1; s2.born = 1;
  s1.vx = 0; s1.vy = 0; s2.vx = 0; s2.vy = 0;
  g.setBodies([s1, s2]);
  for (let i = 0; i < 45; i++) g.updatePlay(1 / 60);
  assert(g.merges() >= 1, 'side-by-side same orbs fuse after settle');
  assert(g.bodies().some(x => x.type === 2), 'settled pair becomes next tier');

  // Three same orbs → only pairwise (not one mega fuse)
  g.startGame();
  const t0 = g.makeBody(0, 120, 480); t0.born = 1; t0.mergeLock = 0;
  const t1 = g.makeBody(0, 120 + r * 2, 480); t1.born = 1; t1.mergeLock = 0;
  const t2 = g.makeBody(0, 120 + r * 4, 480); t2.born = 1; t2.mergeLock = 0;
  g.setBodies([t0, t1, t2]);
  g.applyMerges();
  // One pair fuses → type-1 + leftover type-0 (two bodies)
  assertEq(g.bodies().length, 2, 'three same → pair fuse leaves one');
  assertEq(g.bodies().filter(x => x.type === 0).length, 1, 'one type-0 remains');
  assertEq(g.bodies().filter(x => x.type === 1).length, 1, 'one type-1 created');
}

section('chain merge across frames');
{
  const { api: g } = loadGame();
  g.startGame();
  // Two type-0 overlapping → type-1; immediately merge another pair into type-1,
  // then fuse those two type-1 into type-2 (true chain).
  const a = g.makeBody(0, 120, 500); a.born = 1; a.mergeLock = 0;
  const b = g.makeBody(0, 122, 500); b.born = 1; b.mergeLock = 0;
  g.setBodies([a, b]);
  g.applyMerges();
  assertEq(g.bodies().length, 1, 'first pair → one body');
  assertEq(g.bodies()[0].type, 1, 'first pair → type 1');

  const c = g.makeBody(0, 200, 500); c.born = 1; c.mergeLock = 0;
  const d = g.makeBody(0, 202, 500); d.born = 1; d.mergeLock = 0;
  g.setBodies([...g.bodies(), c, d]);
  g.applyMerges();
  assertEq(g.bodies().filter(x => x.type === 1).length, 2, 'two type-1 after second pair');

  // Overlap the two type-1 orbs and clear merge locks
  const t1 = g.bodies().filter(x => x.type === 1);
  t1[0].x = 160; t1[0].y = 500; t1[0].mergeLock = 0;
  t1[1].x = 162; t1[1].y = 500; t1[1].mergeLock = 0;
  g.applyMerges();
  assert(g.bodies().some(x => x.type === 2), 'two type-1 fuse to type 2');
  assert(g.merges() >= 3, 'three merges in chain');
}

section('falling orb settles');
{
  const { api: g } = loadGame();
  g.startGame();
  g.dropOrb();
  const y0 = g.bodies()[0].y;
  for (let i = 0; i < 20; i++) g.updatePlay(1 / 60);
  assert(g.bodies()[0].y > y0, 'falls down');
  for (let i = 0; i < 180; i++) g.updatePlay(1 / 60);
  assert(g.bodies()[0].y + g.bodies()[0].r <= g.BIN.bottom + 0.5, 'on floor');
  assert(g.bodies()[0].settled === true, 'settled');
}

section('walls clamp bodies');
{
  const { api: g } = loadGame();
  const b = g.makeBody(0, g.BIN.left - 50, g.BIN.bottom - 40);
  g.setBodies([b]);
  g.stepPhysics(g.bodies(), 1 / 60);
  assert(g.bodies()[0].x - g.bodies()[0].r >= g.BIN.left - 0.01, 'left wall');
  const b2 = g.makeBody(0, g.BIN.right + 50, g.BIN.bottom - 40);
  g.setBodies([b2]);
  g.stepPhysics(g.bodies(), 1 / 60);
  assert(g.bodies()[0].x + g.bodies()[0].r <= g.BIN.right + 0.01, 'right wall');
}

section('clampHoldX');
{
  const { api: g } = loadGame();
  const r = g.ORBS[0].r;
  assertEq(g.clampHoldX(-999, 0), g.BIN.left + r, 'left');
  assertEq(g.clampHoldX(9999, 0), g.BIN.right - r, 'right');
  const mid = (g.BIN.left + g.BIN.right) / 2;
  assertEq(g.clampHoldX(mid, 0), mid, 'center');
}

section('danger line game over');
{
  const { api: g } = loadGame();
  g.startGame();
  // Settled body with top clearly above danger line
  const b = g.makeBody(2, (g.BIN.left + g.BIN.right) / 2, g.DANGER_Y - 10);
  b.born = 1;
  b.age = g.DANGER_GRACE + 0.5;
  b.settled = true;
  b.vx = 0; b.vy = 0;
  b.dangerTimer = 0;
  g.setBodies([b]);
  assert(g.isAboveDangerLine(b), 'fixture is above danger line');
  let steps = 0;
  while (g.state() === 'play' && steps < 200) {
    g.checkDanger(0.1);
    steps++;
  }
  assertEq(g.state(), 'over', 'overflow ends game when settled above line');
  assert(String(g.overReason()).length > 0, 'has over reason');
}

section('danger line ends even when pile is jittering (full-bin bug)');
{
  const { api: g } = loadGame();
  g.startGame();
  // Simulate a dense pile: orb above line with micro-velocity that would
  // fail the old `settled` (speed < SLEEP_SPEED ~18) check forever.
  const b = g.makeBody(3, (g.BIN.left + g.BIN.right) / 2, g.DANGER_Y - 20);
  b.born = 1;
  b.age = g.DANGER_GRACE + 1;
  b.settled = false;
  b.vx = 25;
  b.vy = -15; // speed ≈ 29 — above SLEEP, below DANGER_STILL
  b.dangerTimer = 0;
  g.setBodies([b]);
  assert(g.isAboveDangerLine(b), 'jitter fixture is above line');
  assert(g.isRestingForDanger(b), 'jitter counts as resting for danger');
  assert(g.speed(b) > 18, 'fixture is NOT physics-settled (old bug condition)');

  let steps = 0;
  while (g.state() === 'play' && steps < 200) {
    // keep micro-jitter so settled stays false
    b.settled = false;
    b.vx = 25;
    b.vy = -15;
    g.checkDanger(0.1);
    steps++;
  }
  assertEq(g.state(), 'over', 'full bin with jitter must still end the game');
}

section('fresh drop above line does not instantly kill');
{
  const { api: g } = loadGame();
  g.startGame();
  const b = g.makeBody(0, (g.BIN.left + g.BIN.right) / 2, g.DROP_Y);
  b.born = 0.2;
  b.age = 0.05; // still in grace
  b.settled = false;
  b.dangerTimer = 0;
  g.setBodies([b]);
  for (let i = 0; i < 5; i++) g.checkDanger(0.1);
  assertEq(g.state(), 'play', 'grace protects falling drop');
}

section('save / high score');
{
  const { api: g, sandbox } = loadGame();
  sandbox.localStorage.clear();
  // re-init save from empty storage is already done at load; mutate and persist
  g.save.best = 0;
  g.save.games = 0;
  g.recordGameEnd(120, 4, 10);
  assertEq(g.save.best, 120, 'best set');
  assertEq(g.save.games, 1, 'games count');
  assertEq(g.save.biggest, 4, 'biggest type');
  g.recordGameEnd(50, 2, 3);
  assertEq(g.save.best, 120, 'best not lowered');
  assertEq(g.save.games, 2, 'games increments');
  const raw = sandbox.localStorage.getItem(g.SAVE_KEY);
  assert(raw && JSON.parse(raw).best === 120, 'persisted to localStorage');
}

section('version + SW sync');
{
  const { api: g } = loadGame();
  assert(/^\d+\.\d+\.\d{3}$/.test(g.GAME_VERSION), 'version format');
  assertEq(g.GAME_VERSION_LABEL, 'v' + g.GAME_VERSION, 'label');
  const sw = read('sw.js');
  assert(sw.includes(`drop-and-fuse-${g.GAME_VERSION}`), 'SW CACHE matches GAME_VERSION');
  assert(sw.includes('js/input.js'), 'SW caches input.js');
}

section('PWA shell files');
{
  const html = read('index.html');
  const man = JSON.parse(read('manifest.webmanifest'));
  assert(html.includes('manifest.webmanifest'), 'manifest linked');
  assert(html.includes('js/input.js'), 'input.js loaded');
  assert(html.includes('id="versionTag"'), 'version tag');
  assert(html.includes('play-chrome'), 'play chrome class');
  assert(!html.includes('data-screen="play"'), 'no full-screen play overlay');
  assertEq(man.display, 'standalone', 'standalone');
  for (const icon of man.icons) assert(exists(icon.src), `icon ${icon.src}`);
  assert(exists('apple-touch-icon.png'), 'apple touch icon');
  assert(exists('css/style.css'), 'css');
  const css = read('css/style.css');
  assert(!css.includes('.play-ui'), 'no .play-ui overlay CSS');
}

section('orb ladder');
{
  const { api: g } = loadGame();
  assert(g.ORBS.length === g.MAX_TYPE + 1, 'ORBS length');
  for (let i = 1; i < g.ORBS.length; i++) {
    assert(g.ORBS[i].r > g.ORBS[i - 1].r, `radius increases at ${i}`);
    assert(g.ORBS[i].score >= g.ORBS[i - 1].score, `score nondecreasing at ${i}`);
  }
  assert(g.DROP_TYPES < g.ORBS.length, 'drop pool smaller than full ladder');
  // Every orb has a kid-facing name (no bare numbers as identity)
  for (const o of g.ORBS) {
    assert(typeof o.label === 'string' && o.label.length > 0, `label for type ${o.id}`);
  }
  assert(typeof g.MERGE_TOUCH === 'number' && g.MERGE_TOUCH > 0, 'MERGE_TOUCH configured');
}

// -------------------- summary --------------------
console.log('\n\n────────────────────────────');
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('All Drop & Fuse tests passed.\n');
