'use strict';
// Drop & Fuse — tuning knobs

// ---- Version (MAJOR.MINOR.PATCH) --------------------------------------------
// Shown in the UI as "Drop & Fuse vMAJOR.MINOR.PPP" (patch zero-padded to 3 digits).
//   major — breaking / generation changes
//   minor — features (systems, big content)
//   patch — bugfixes, perf, polish
// Keep CACHE in sw.js in sync: 'drop-and-fuse-' + GAME_VERSION
const GAME_VERSION = '1.1.001';
const GAME_VERSION_LABEL = 'v' + GAME_VERSION;
const GAME_NAME = 'Drop & Fuse';

// Logical stage size (letterboxed to fit screen)
const W = 390;
const H = 700;

// Play container (walls)
const WALL = 10;
const BIN = {
  left: 28,
  right: W - 28,
  top: 110,
  bottom: H - 36,
};
const BIN_W = BIN.right - BIN.left;
const BIN_H = BIN.bottom - BIN.top;

// Danger line (y increases downward). Drop spawns ABOVE this line; pieces
// that stay above it after a grace period end the run.
const DANGER_Y = BIN.top + 72;
const DANGER_HOLD = 0.85;       // seconds continuously in the danger zone
const DANGER_GRACE = 0.55;      // ignore freshly dropped orbs this long
const DANGER_STILL = 140;       // speed threshold for "resting" (lenient — pile jitters)

// Physics
const GRAVITY = 1850;
const RESTITUTION = 0.12;
const FRICTION = 0.988;
const GROUND_FRICTION = 0.82;
const WALL_FRICTION = 0.96;
const SLEEP_SPEED = 22;
const SLEEP_TIME = 0.12;        // must stay slow this long before hard-sleep
const MERGE_COOLDOWN = 0.08;
// Same-type orbs fuse when touching or within this many px (physics settles
// pairs at exact contact — requiring deep overlap made merges feel random).
const MERGE_TOUCH = 2.5;
const DROP_COOLDOWN = 0.35;
const MAX_BODIES = 80;
const SUBSTEPS = 4;

// Orb types: radius grows ~1.28× each step (Suika-like)
// score = points awarded when this type is CREATED by a merge
const ORBS = [
  { id: 0,  r: 16,  color: '#7af0ff', glow: '#3de7ff', label: 'Spark',  score: 1   },
  { id: 1,  r: 21,  color: '#8bffb0', glow: '#58d68d', label: 'Mint',   score: 3   },
  { id: 2,  r: 27,  color: '#ffe66d', glow: '#ffd23e', label: 'Solar',  score: 6   },
  { id: 3,  r: 34,  color: '#ffb347', glow: '#ff9f1c', label: 'Amber',  score: 10  },
  { id: 4,  r: 42,  color: '#ff7a9a', glow: '#ff4f7a', label: 'Blush',  score: 15  },
  { id: 5,  r: 52,  color: '#ff6ad5', glow: '#ff4fd8', label: 'Nova',   score: 21  },
  { id: 6,  r: 64,  color: '#c77dff', glow: '#a855f7', label: 'Pulse',  score: 28  },
  { id: 7,  r: 78,  color: '#7c9bff', glow: '#5b7cfa', label: 'Tide',   score: 36  },
  { id: 8,  r: 94,  color: '#5eead4', glow: '#2dd4bf', label: 'Aura',   score: 45  },
  { id: 9,  r: 112, color: '#f0abfc', glow: '#e879f9', label: 'Prism',  score: 55  },
  { id: 10, r: 132, color: '#fde68a', glow: '#fbbf24', label: 'Core',   score: 80  },
];

const MAX_TYPE = ORBS.length - 1;
// Random drop only from the first N types
const DROP_TYPES = 5;

// Drop spawn
const DROP_Y = BIN.top + 28;
