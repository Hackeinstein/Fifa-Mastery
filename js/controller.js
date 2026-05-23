// ─── controller.js ───────────────────────────────────────────────────────────
// Virtual DualSense SVG: highlight, animate, reset. All DOM mutations live here.

import { State } from './state.js';

const STICK_SCALE = 8;
const DIRECTIONS = ['UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT'];

const _DIRECTION_VECTORS = {
  UP: { x: 0, y: -1 },
  UP_RIGHT: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  RIGHT: { x: 1, y: 0 },
  DOWN_RIGHT: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  DOWN: { x: 0, y: 1 },
  DOWN_LEFT: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  LEFT: { x: -1, y: 0 },
  UP_LEFT: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
};

let _svgEl = null;
let _btnMap = new Map();
let _lsKnob = null;
let _rsKnob = null;
let _lightbar = null;
let _beatRing = null;
let _lsArrows = {};
let _rsArrows = {};
let _lsArrowGroup = null;
let _rsArrowGroup = null;

// Special target mapping: human-readable names → DOM queries
const _TARGET_MAP = {
  'LEFT_STICK': () => _svgEl.querySelector('#LEFT_STICK'),
  'RIGHT_STICK': () => _svgEl.querySelector('#RIGHT_STICK'),
  'trigger-l2': () => document.getElementById('trigger-l2'),
  'trigger-r2': () => document.getElementById('trigger-r2'),
  'L1': () => _btnMap.get('L1'),
  'R1': () => _btnMap.get('R1'),
  'CIRCLE': () => _btnMap.get('◯'),
  'CROSS': () => _btnMap.get('✕'),
  'SQUARE': () => _btnMap.get('□'),
  'TRIANGLE': () => _btnMap.get('△'),
  'DPAD_UP': () => _btnMap.get('D-Up'),
  'DPAD_DOWN': () => _btnMap.get('D-Down'),
  'DPAD_LEFT': () => _btnMap.get('D-Left'),
  'DPAD_RIGHT': () => _btnMap.get('D-Right'),
  'PS': () => _btnMap.get('PS'),
  'CREATE': () => _btnMap.get('Create'),
  'OPTIONS': () => _btnMap.get('Options'),
  'MUTE': () => _btnMap.get('Mute'),
};

const _resolveTarget = (targetName) => {
  const resolver = _TARGET_MAP[targetName];
  if (resolver) return resolver();
  // Try data-btn map
  return _btnMap.get(targetName) || null;
};

const _createArrows = (groupEl, prefix) => {
  const arrows = {};
  const cx = 0, cy = 0, r = 30, arrowLen = 12;
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 - 90) * (Math.PI / 180);
    const sx = cx + Math.cos(angle) * (r - arrowLen);
    const sy = cy + Math.sin(angle) * (r - arrowLen);
    const ex = cx + Math.cos(angle) * r;
    const ey = cy + Math.sin(angle) * r;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${sx},${sy} L${ex},${ey}`);
    path.setAttribute('stroke', '#06b6d4');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '0');
    path.classList.add('stick-arrow');
    path.setAttribute('data-direction', DIRECTIONS[i]);
    groupEl.appendChild(path);
    arrows[DIRECTIONS[i]] = path;
  }
  return arrows;
};

const _getAllElements = () => {
  const all = [];
  for (const el of _btnMap.values()) {
    if (el) all.push(el);
  }
  // Also stick groups
  const ls = _svgEl.querySelector('#LEFT_STICK');
  const rs = _svgEl.querySelector('#RIGHT_STICK');
  if (ls) all.push(ls);
  if (rs) all.push(rs);
  // Trigger divs
  const tl2 = document.getElementById('trigger-l2');
  const tr2 = document.getElementById('trigger-r2');
  if (tl2) all.push(tl2);
  if (tr2) all.push(tr2);
  return all;
};

export const Controller = {
  init(svgEl) {
    _svgEl = svgEl;
    // Cache all data-btn elements
    _btnMap.clear();
    const btnEls = svgEl.querySelectorAll('[data-btn]');
    for (const el of btnEls) {
      _btnMap.set(el.getAttribute('data-btn'), el);
    }
    // Knobs
    _lsKnob = svgEl.querySelector('#LS_KNOB');
    _rsKnob = svgEl.querySelector('#RS_KNOB');
    // Lightbar
    _lightbar = svgEl.querySelector('#LIGHTBAR');
    // Create arrow groups inside stick groups
    _lsArrowGroup = svgEl.querySelector('#LEFT_STICK');
    _rsArrowGroup = svgEl.querySelector('#RIGHT_STICK');
    if (_lsArrowGroup) _lsArrows = _createArrows(_lsArrowGroup, 'LS');
    if (_rsArrowGroup) _rsArrows = _createArrows(_rsArrowGroup, 'RS');
    // Create beat ring
    _beatRing = svgEl.querySelector('#beat-ring');
    if (!_beatRing) {
      const ns = 'http://www.w3.org/2000/svg';
      _beatRing = document.createElementNS(ns, 'circle');
      _beatRing.setAttribute('id', 'beat-ring');
      _beatRing.setAttribute('cx', '288');
      _beatRing.setAttribute('cy', '192');
      _beatRing.setAttribute('r', '170');
      _beatRing.setAttribute('fill', 'none');
      _beatRing.setAttribute('stroke', '#06b6d4');
      _beatRing.setAttribute('stroke-width', '2');
      _beatRing.setAttribute('opacity', '0');
      _beatRing.setAttribute('pointer-events', 'none');
      svgEl.appendChild(_beatRing);
    }

    console.log('Controller initialized:', _btnMap.size, 'buttons cached');
  },

  highlight(svgTargets, state, durationMs) {
    if (!Array.isArray(svgTargets)) return;
    for (const targetName of svgTargets) {
      const el = _resolveTarget(targetName);
      if (!el) {
        console.warn(`Controller.highlight: target "${targetName}" not found`);
        continue;
      }
      // Remove all ctrl-* classes
      el.classList.remove('ctrl-idle', 'ctrl-next', 'ctrl-active', 'ctrl-perfect', 'ctrl-good', 'ctrl-ok', 'ctrl-miss', 'ctrl-hold', 'ctrl-pressed');
      // Add state class
      const cls = `ctrl-${state}`;
      el.classList.add(cls);
      // Revert after duration
      if (durationMs && durationMs > 0 && state !== 'idle' && state !== 'next') {
        setTimeout(() => {
          el.classList.remove(cls);
          el.classList.add('ctrl-idle');
        }, durationMs);
      }
    }
  },

  showStickArrow(side, direction) {
    const arrows = side === 'LS' ? _lsArrows : _rsArrows;
    if (!arrows) return;
    // Hide all
    for (const [dir, el] of Object.entries(arrows)) {
      el.setAttribute('opacity', '0');
      el.classList.remove('active-arrow');
    }
    // Show target
    const arrow = arrows[direction];
    if (arrow) {
      arrow.setAttribute('opacity', '1');
      arrow.classList.add('active-arrow');
    }
  },

  hideStickArrow(side) {
    const arrows = side === 'LS' ? _lsArrows : _rsArrows;
    if (!arrows) return;
    for (const el of Object.values(arrows)) {
      el.setAttribute('opacity', '0');
      el.classList.remove('active-arrow');
    }
  },

  animateStickTo(side, direction, intensity) {
    const knob = side === 'LS' ? _lsKnob : _rsKnob;
    if (!knob) return;
    const vec = _DIRECTION_VECTORS[direction] || { x: 0, y: 0 };
    const dx = vec.x * STICK_SCALE * intensity;
    const dy = vec.y * STICK_SCALE * intensity;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  },

  // Called every poll frame with raw gamepad axes (rawY = axes[1], not inverted)
  updateStickPosition(side, x, rawY) {
    const knob = side === 'LS' ? _lsKnob : _rsKnob;
    if (!knob) return;
    // SVG positive-Y is down, axes[1] positive is also down — use rawY directly
    knob.style.transform = `translate(${x * STICK_SCALE}px, ${rawY * STICK_SCALE}px)`;
  },

  resetStick(side) {
    const knob = side === 'LS' ? _lsKnob : _rsKnob;
    if (knob) knob.style.transform = 'translate(0, 0)';
  },

  pulseBeat() {
    if (!_beatRing) return;
    _beatRing.setAttribute('opacity', '0.8');
    _beatRing.style.animation = 'none';
    void _beatRing.offsetWidth;
    _beatRing.style.animation = 'beat-pulse 200ms ease';
    setTimeout(() => {
      _beatRing.setAttribute('opacity', '0');
    }, 200);
  },

  setLightbar(color) {
    if (_lightbar) _lightbar.setAttribute('fill', color);
  },

  markButtonPressed(token) {
    const el = _btnMap.get(token);
    if (el) el.classList.add('ctrl-pressed');
    // Also handle triggers
    if (token === 'L2') {
      const tl2 = document.getElementById('trigger-l2');
      if (tl2) tl2.classList.add('active');
    }
    if (token === 'R2') {
      const tr2 = document.getElementById('trigger-r2');
      if (tr2) tr2.classList.add('active');
    }
  },

  markButtonReleased(token) {
    const el = _btnMap.get(token);
    if (el) el.classList.remove('ctrl-pressed');
    if (token === 'L2') {
      const tl2 = document.getElementById('trigger-l2');
      if (tl2) tl2.classList.remove('active');
    }
    if (token === 'R2') {
      const tr2 = document.getElementById('trigger-r2');
      if (tr2) tr2.classList.remove('active');
    }
  },

  resetAll() {
    const all = _getAllElements();
    for (const el of all) {
      if (!el) continue;
      el.classList.remove('ctrl-idle', 'ctrl-next', 'ctrl-active', 'ctrl-perfect', 'ctrl-good', 'ctrl-ok', 'ctrl-miss', 'ctrl-hold', 'ctrl-pressed');
      el.classList.add('ctrl-idle');
    }
    // Reset sticks
    this.resetStick('LS');
    this.resetStick('RS');
    // Hide arrows
    this.hideStickArrow('LS');
    this.hideStickArrow('RS');
    // Reset lightbar
    this.setLightbar('rgba(0,0,0,0.3)');
    // Reset triggers
    const tl2 = document.getElementById('trigger-l2');
    const tr2 = document.getElementById('trigger-r2');
    if (tl2) tl2.classList.remove('active');
    if (tr2) tr2.classList.remove('active');
  },

  getButtonElement(token) {
    return _btnMap.get(token) || null;
  }
};
