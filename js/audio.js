'use strict';

let audioCtx = null;

function ensureAudio() {
  if (save.muted) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep({ freq = 440, dur = 0.08, type = 'sine', gain = 0.04, slide = 0 } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sfxDrop() {
  beep({ freq: 220, dur: 0.06, type: 'triangle', gain: 0.035 });
}

function sfxMerge(type) {
  const base = 320 + type * 36;
  beep({ freq: base, dur: 0.1, type: 'sine', gain: 0.05, slide: 80 });
  setTimeout(() => beep({ freq: base * 1.5, dur: 0.08, type: 'sine', gain: 0.03 }), 40);
}

function sfxGameOver() {
  beep({ freq: 300, dur: 0.15, type: 'sawtooth', gain: 0.03, slide: -120 });
  setTimeout(() => beep({ freq: 180, dur: 0.22, type: 'triangle', gain: 0.035, slide: -60 }), 100);
}

function sfxClick() {
  beep({ freq: 520, dur: 0.04, type: 'square', gain: 0.02 });
}
