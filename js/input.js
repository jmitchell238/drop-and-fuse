'use strict';

/**
 * Touch/mouse aiming helpers.
 * Kept free of DOM so Node tests can cover the real rules used on iPad.
 */

/** True when the event target is chrome we should not treat as "aim/drop". */
function isUiChromeTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest(
    'button, a, input, select, textarea, label, .menu-card, ' +
    '.screen[data-screen="menu"], .screen[data-screen="over"]'
  );
}

/**
 * Map client coordinates into logical stage space (W×H).
 * Returns null if the canvas has no measurable box (layout not ready).
 */
function clientToStage(clientX, clientY, rect, stageW, stageH) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * stageW,
    y: ((clientY - rect.top) / rect.height) * stageH,
  };
}

/**
 * Decide whether a pointer/touch sequence should start aiming.
 * - only while playing
 * - not on UI chrome
 * - canvas/stage must have a real size
 */
function shouldBeginAim({ state, target, rect }) {
  if (state !== 'play') return false;
  if (isUiChromeTarget(target)) return false;
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false;
  return true;
}

/**
 * Apply aim X from a client position. Returns clamped hold X or null.
 */
function aimFromClient({ clientX, clientY, rect, stageW, stageH, holdType, clampHoldX }) {
  const p = clientToStage(clientX, clientY, rect, stageW, stageH);
  if (!p) return null;
  return clampHoldX(p.x, holdType);
}

/**
 * Should releasing the pointer drop an orb?
 * Tap (no move) and drag both count once aiming was started.
 */
function shouldDropOnRelease({ state, aiming, canDrop }) {
  return state === 'play' && aiming === true && canDrop === true;
}

// UMD-ish export for Node tests without breaking browser globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isUiChromeTarget,
    clientToStage,
    shouldBeginAim,
    aimFromClient,
    shouldDropOnRelease,
  };
}
