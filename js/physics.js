'use strict';

let _id = 1;

function makeBody(type, x, y, opts = {}) {
  const def = ORBS[type];
  return {
    id: _id++,
    type,
    r: def.r,
    x, y,
    vx: 0,
    vy: 0,
    mass: def.r * def.r,
    invMass: 1 / (def.r * def.r),
    alive: true,
    settled: false,
    mergeLock: 0,
    born: 0,          // pop-in scale timer
    dangerTimer: 0,
    dropped: !!opts.dropped,
  };
}

function speed(b) {
  return Math.hypot(b.vx, b.vy);
}

function integrate(bodies, dt) {
  for (const b of bodies) {
    if (!b.alive) continue;
    b.vy += GRAVITY * dt;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.mergeLock > 0) b.mergeLock -= dt;
    if (b.born < 1) b.born = Math.min(1, b.born + dt * 6);
  }
}

function resolveWalls(bodies) {
  for (const b of bodies) {
    if (!b.alive) continue;
    // left
    if (b.x - b.r < BIN.left) {
      b.x = BIN.left + b.r;
      b.vx = Math.abs(b.vx) * RESTITUTION;
      b.vx *= WALL_FRICTION;
    }
    // right
    if (b.x + b.r > BIN.right) {
      b.x = BIN.right - b.r;
      b.vx = -Math.abs(b.vx) * RESTITUTION;
      b.vx *= WALL_FRICTION;
    }
    // floor
    if (b.y + b.r > BIN.bottom) {
      b.y = BIN.bottom - b.r;
      if (b.vy > 0) b.vy = -b.vy * RESTITUTION;
      b.vx *= GROUND_FRICTION;
      if (Math.abs(b.vy) < SLEEP_SPEED) b.vy = 0;
    }
    // soft ceiling — don't hard clamp so danger works; just mild bounce if somehow above bin top
    if (b.y - b.r < BIN.top - 40) {
      b.y = BIN.top - 40 + b.r;
      b.vy = Math.abs(b.vy) * 0.2;
    }
  }
}

function resolvePairs(bodies) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (!b.alive) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minDist = a.r + b.r;
      if (dist <= 0.0001) {
        dx = 0.01;
        dy = 0;
        dist = 0.01;
      }
      if (dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      // positional correction (mass weighted)
      const invSum = a.invMass + b.invMass;
      const corr = overlap / invSum;
      a.x -= nx * corr * a.invMass;
      a.y -= ny * corr * a.invMass;
      b.x += nx * corr * b.invMass;
      b.y += ny * corr * b.invMass;

      // relative velocity along normal
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velN = rvx * nx + rvy * ny;
      if (velN > 0) continue; // separating

      const e = RESTITUTION;
      const jImp = -(1 + e) * velN / invSum;
      const ix = jImp * nx;
      const iy = jImp * ny;
      a.vx -= ix * a.invMass;
      a.vy -= iy * a.invMass;
      b.vx += ix * b.invMass;
      b.vy += iy * b.invMass;

      // light tangential friction
      const tx = -ny, ty = nx;
      const velT = rvx * tx + rvy * ty;
      const jt = -velT / invSum * 0.15;
      a.vx -= jt * tx * a.invMass;
      a.vy -= jt * ty * a.invMass;
      b.vx += jt * tx * b.invMass;
      b.vy += jt * ty * b.invMass;
    }
  }
}

function findMerges(bodies) {
  const pairs = [];
  const used = new Set();
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    if (!a.alive || a.mergeLock > 0 || used.has(a.id)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (!b.alive || b.mergeLock > 0 || used.has(b.id)) continue;
      if (a.type !== b.type) continue;
      if (a.type >= MAX_TYPE) continue; // max tier does not merge further
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < a.r + b.r - 1.5) {
        pairs.push([a, b]);
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  }
  return pairs;
}

function stepPhysics(bodies, dt) {
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    integrate(bodies, h);
    resolveWalls(bodies);
    resolvePairs(bodies);
    resolveWalls(bodies);
  }
  for (const b of bodies) {
    if (!b.alive) continue;
    b.settled = speed(b) < SLEEP_SPEED;
  }
}
