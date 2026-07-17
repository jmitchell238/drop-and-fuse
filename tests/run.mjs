#!/usr/bin/env node
/**
 * Drop & Fuse — lightweight TDD runner (no browser / no deps).
 * Run: node tests/run.mjs
 *
 * Loads game modules as ONE script (like the browser) into a sandboxed context.
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

function loadGame() {
  // Mirror browser script order as a single evaluation so const/let bind once.
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
    .map(rel => `// ---- ${rel} ----\n` + fs.readFileSync(path.join(root, rel), 'utf8'))
    .join('\n;\n');

  // Expose key bindings on globalThis for assertions.
  const exportFooter = `
    globalThis.__TEST__ = {
      GAME_VERSION, GAME_VERSION_LABEL, GAME_NAME,
      W, H, BIN, ORBS, DROP_Y, DROP_TYPES, DROP_COOLDOWN, MAX_TYPE, MAX_BODIES,
      state: () => state,
      setState: (s) => { state = s; },
      bodies: () => bodies,
      setBodies: (b) => { bodies = b; },
      score: () => score,
      merges: () => merges,
      canDrop: () => canDrop,
      holdType: () => holdType,
      holdX: () => holdX,
      setHoldX: (x) => { holdX = x; },
      startGame, resetRun, dropOrb, clampHoldX, updatePlay, applyMerges,
      makeBody, findMerges, stepPhysics,
      isUiChromeTarget, clientToStage, shouldBeginAim, aimFromClient, shouldDropOnRelease,
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
  return ctx.__TEST__;
}

function section(name) {
  process.stdout.write('\n• ' + name + ' ');
}

// -------------------- tests --------------------
section('input helpers');
{
  const g = loadGame();

  assert(typeof g.shouldBeginAim === 'function', 'shouldBeginAim is defined');

  assertEq(
    g.shouldBeginAim({ state: 'play', target: {}, rect: { width: 0, height: 0 } }),
    false,
    'no aim when canvas has zero size'
  );
  assertEq(
    g.shouldBeginAim({ state: 'menu', target: {}, rect: { width: 100, height: 200 } }),
    false,
    'no aim on menu'
  );
  assertEq(
    g.shouldBeginAim({ state: 'play', target: {}, rect: { width: 100, height: 200 } }),
    true,
    'aim allowed on play with valid rect'
  );

  const fakeBtn = {
    closest(sel) {
      return sel.includes('button') ? this : null;
    },
  };
  assertEq(
    g.shouldBeginAim({ state: 'play', target: fakeBtn, rect: { width: 100, height: 200 } }),
    false,
    'no aim when pressing UI chrome'
  );

  const rect = { left: 100, top: 50, width: 390, height: 700 };
  const p = g.clientToStage(100 + 195, 50 + 350, rect, 390, 700);
  assert(p && Math.abs(p.x - 195) < 0.01 && Math.abs(p.y - 350) < 0.01, 'clientToStage center maps correctly');
  assertEq(g.clientToStage(0, 0, { width: 0, height: 0 }, 390, 700), null, 'clientToStage null on bad rect');

  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: true, canDrop: true }), true, 'drop when aiming+canDrop');
  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: false, canDrop: true }), false, 'no drop without aiming');
  assertEq(g.shouldDropOnRelease({ state: 'play', aiming: true, canDrop: false }), false, 'no drop while cooling down');
  assertEq(g.shouldDropOnRelease({ state: 'menu', aiming: true, canDrop: true }), false, 'no drop on menu');

  const hold = g.aimFromClient({
    clientX: 100 + 0,
    clientY: 50,
    rect,
    stageW: 390,
    stageH: 700,
    holdType: 0,
    clampHoldX: g.clampHoldX,
  });
  assert(hold != null && hold >= g.BIN.left + g.ORBS[0].r, 'aim clamps to left wall');
}

section('first drop must work (the iPad bug)');
{
  const g = loadGame();
  g.startGame();
  assertEq(g.state(), 'play', 'startGame enters play');
  assertEq(g.canDrop(), true, 'can drop immediately');
  assertEq(g.bodies().length, 0, 'no bodies yet');

  assertEq(
    g.shouldDropOnRelease({ state: g.state(), aiming: true, canDrop: g.canDrop() }),
    true,
    'tap-release should allow drop'
  );
  const ok = g.dropOrb();
  assertEq(ok, true, 'dropOrb returns true for first drop');
  assertEq(g.bodies().length, 1, 'exactly one body after first drop');
  assertEq(g.canDrop(), false, 'canDrop false after drop (cooldown)');
  assert(g.bodies()[0].y === g.DROP_Y, 'spawned at DROP_Y');
  assert(g.bodies()[0].r === g.ORBS[g.bodies()[0].type].r, 'radius matches type');

  assertEq(g.dropOrb(), false, 'second drop blocked during cooldown');

  for (let i = 0; i < 30; i++) g.updatePlay(0.05);
  assertEq(g.canDrop(), true, 'canDrop restored after cooldown time');
  assertEq(g.dropOrb(), true, 'second drop works after cooldown');
  assertEq(g.bodies().length, 2, 'two bodies after second drop');
}

section('physics + merge');
{
  const g = loadGame();
  g.startGame();

  const a = g.makeBody(0, g.BIN.left + 80, g.BIN.bottom - 20);
  const b = g.makeBody(0, g.BIN.left + 80 + 8, g.BIN.bottom - 20);
  a.born = 1; b.born = 1;
  g.setBodies([a, b]);
  const before = g.score();
  g.applyMerges();
  assert(g.bodies().length === 1, 'merge reduces to one body');
  assertEq(g.bodies()[0].type, 1, 'merged into next type');
  assert(g.score() > before, 'score increased on merge');
  assertEq(g.merges(), 1, 'merge counter');

  g.setBodies([
    g.makeBody(0, 100, 400),
    g.makeBody(1, 105, 400),
  ]);
  g.bodies().forEach(x => { x.born = 1; });
  g.applyMerges();
  assertEq(g.bodies().length, 2, 'different types stay separate');
}

section('physics step moves falling orb');
{
  const g = loadGame();
  g.startGame();
  g.dropOrb();
  const y0 = g.bodies()[0].y;
  for (let i = 0; i < 20; i++) g.updatePlay(1 / 60);
  assert(g.bodies()[0].y > y0, 'orb falls downward under gravity');
  for (let i = 0; i < 180; i++) g.updatePlay(1 / 60);
  assert(g.bodies()[0].y + g.bodies()[0].r <= g.BIN.bottom + 0.5, 'orb rests on floor');
  assert(g.bodies()[0].settled === true, 'orb settles');
}

section('clampHoldX respects walls');
{
  const g = loadGame();
  const r = g.ORBS[0].r;
  assertEq(g.clampHoldX(-999, 0), g.BIN.left + r, 'left clamp');
  assertEq(g.clampHoldX(9999, 0), g.BIN.right - r, 'right clamp');
  const mid = (g.BIN.left + g.BIN.right) / 2;
  assertEq(g.clampHoldX(mid, 0), mid, 'center unchanged');
}

section('version format');
{
  const g = loadGame();
  assert(/^\d+\.\d+\.\d{3}$/.test(g.GAME_VERSION), 'GAME_VERSION is MAJOR.MINOR.PPP');
  assertEq(g.GAME_VERSION_LABEL, 'v' + g.GAME_VERSION, 'label prefixes v');
}

section('play overlay must not be a full-screen hit target');
{
  // Static HTML regression: play chrome is buttons/hint, not a .screen covering canvas.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(!html.includes('data-screen="play"'), 'no full-screen play screen layer in HTML');
  assert(html.includes('play-chrome'), 'play chrome class present');
  assert(html.includes('js/input.js'), 'input helpers script included');

  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert(!css.includes('.play-ui'), 'old .play-ui overlay styles removed');
}

// -------------------- summary --------------------
console.log('\n\n────────────────────────────');
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log('All tests passed.\n');
