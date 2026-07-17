'use strict';

const particles = [];

function spawnBurst(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 220;
    particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 40,
      life: 0.35 + Math.random() * 0.35,
      max: 0.7,
      r: 2 + Math.random() * 4,
      color,
    });
  }
}

function spawnPop(x, y, color, r) {
  spawnBurst(x, y, color, Math.min(22, 8 + (r / 8) | 0));
  // ring sparkles
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    particles.push({
      x: x + Math.cos(ang) * r * 0.4,
      y: y + Math.sin(ang) * r * 0.4,
      vx: Math.cos(ang) * 120,
      vy: Math.sin(ang) * 120,
      life: 0.4,
      max: 0.4,
      r: 3,
      color: '#ffffff',
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += 400 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function clearParticles() {
  particles.length = 0;
}
