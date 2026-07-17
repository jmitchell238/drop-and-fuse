'use strict';

const SAVE_KEY = 'drop-and-fuse-v1';

function defaultSave() {
  return {
    best: 0,
    games: 0,
    biggest: 0,   // highest type ever created
    totalMerges: 0,
    muted: false,
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...JSON.parse(raw) };
  } catch {
    return defaultSave();
  }
}

function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
  catch { /* ignore */ }
}

let save = loadSave();

function persist() { writeSave(save); }

function recordGameEnd(score, biggestType, merges) {
  save.games += 1;
  save.totalMerges += merges;
  if (score > save.best) save.best = score;
  if (biggestType > save.biggest) save.biggest = biggestType;
  persist();
}
