// ─── input.js ─────────────────────────────────────────────────────────────────
// Gamepad API polling, input normalization, flick/hold/rotation detection.
// Keyboard fallback for testing without a physical controller.

import { State } from './state.js';
import { Controller } from './controller.js';

const GAMEPAD_MAP = {
  0: '✕', 1: '◯', 2: '□', 3: '△',
  4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3',
  12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right', 16: 'PS'
};

const KEY_MAP = {
  KeyQ: 'L1', KeyE: 'R1',
  KeyW: 'D-Up', KeyA: 'D-Left', KeyS: 'D-Down', KeyD: 'D-Right',
  KeyI: '△', KeyJ: '□', KeyK: '✕', KeyL: '◯',
  ArrowUp: 'D-Up', ArrowDown: 'D-Down', ArrowLeft: 'D-Left', ArrowRight: 'D-Right',
  ShiftLeft: 'L3', ShiftRight: 'R3',
  Digit1: 'L2', Digit2: 'R2',
  Backspace: 'Create', Enter: 'Options', Space: 'PS'
};

const FLICK_THRESHOLD    = 0.55;  // lower = fires earlier in stick travel
const HOLD_THRESHOLD     = 0.50;  // lower = holds detected with less force
const HOLD_DURATION      = 200;   // ms to confirm a hold (was 300)
const FLICK_COOLDOWN     = 80;    // ms between flicks — allows rapid combos (was 200)
const ROTATION_MIN_ARC   = 90;    // degrees of arc needed to emit rotate_cw/ccw (was 180)

const DIRECTIONS = ['RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT', 'UP', 'UP_RIGHT'];

let _rafId = null;
let _prevButtons = new Array(17).fill(false);
let _prevSticks = {
  LS: { x: 0, y: 0, mag: 0 },
  RS: { x: 0, y: 0, mag: 0 }
};
let _flickCooldowns = { LS: 0, RS: 0 };
let _holdState = {
  LS: { start: 0, active: false, direction: null, emitted: false },
  RS: { start: 0, active: false, direction: null, emitted: false }
};
let _rotationHistory = { LS: [], RS: [] };
let _listeners = [];
let _kbMode = false;

const _angleToDirection = (angle) => {
  // Normalize angle to [0, 2π)
  let a = angle;
  if (a < 0) a += 2 * Math.PI;
  const index = Math.round((a / (2 * Math.PI)) * 8) % 8;
  return DIRECTIONS[index];
};

const _directionToAngle = (dir) => {
  const map = {
    RIGHT: 0, DOWN_RIGHT: Math.PI * 0.25, DOWN: Math.PI * 0.5,
    DOWN_LEFT: Math.PI * 0.75, LEFT: Math.PI, UP_LEFT: -Math.PI * 0.75,
    UP: -Math.PI * 0.5, UP_RIGHT: -Math.PI * 0.25
  };
  return map[dir] !== undefined ? map[dir] : 0;
};

const _emit = (event) => {
  for (const fn of _listeners) {
    try { fn(event); } catch (e) { console.warn('Input listener error:', e); }
  }
};

// ── Gamepad polling ──
const _poll = () => {
  _rafId = requestAnimationFrame(_poll);
  const gamepads = navigator.getGamepads();
  const gp = gamepads[State.get('controller').gamepadIndex];
  if (!gp) return;

  const now = performance.now();
  const ctrl = State.get('controller');

  // Buttons
  const inputMap = State.get('settings').inputMap || {};
  for (let i = 0; i < 17; i++) {
    const btn = gp.buttons[i];
    const pressed = btn.pressed;
    const token = GAMEPAD_MAP[i];
    if (!token) continue;

    // Remapped token for engine logic; original token for SVG highlight
    const remapped = inputMap[token] || token;

    if (pressed && !_prevButtons[i]) {
      ctrl.activeButtons.add(remapped);
      _emit({ type: 'button_press', source: 'BUTTON', button: remapped, value: btn.value, timestamp: now });
      Controller.markButtonPressed(token);
    } else if (!pressed && _prevButtons[i]) {
      _emit({ type: 'button_release', source: 'BUTTON', button: remapped, value: 0, timestamp: now });
      Controller.markButtonReleased(token);
      ctrl.activeButtons.delete(remapped);
    }
    _prevButtons[i] = pressed;
  }

  // L2/R2 analog values (buttons 6, 7)
  ctrl.l2Value = gp.buttons[6]?.value || 0;
  ctrl.r2Value = gp.buttons[7]?.value || 0;

  // Axes
  // Standard mapping: 0=LS-X, 1=LS-Y, 2=RS-X, 3=RS-Y
  const axes = gp.axes;
  const lsX = axes[0] || 0;
  const lsRawY = axes[1] || 0;
  const rsX = axes[2] || 0;
  const rsRawY = axes[3] || 0;

  // Invert Y for game-world state (up = positive), keep raw for visual + atan2
  ctrl.leftStick = { x: lsX, y: -lsRawY };
  ctrl.rightStick = { x: rsX, y: -rsRawY };

  // Update SVG knob positions using raw axes (SVG +Y = down = same as axes +Y = down)
  Controller.updateStickPosition('LS', lsX, lsRawY);
  Controller.updateStickPosition('RS', rsX, rsRawY);

  // Pass raw Y to direction detection (atan2: stick pushed up = axes[1] negative = UP angle)
  _processStick('LS', lsX, lsRawY, now);
  _processStick('RS', rsX, rsRawY, now);
};

const _processStick = (side, x, y, now) => {
  const mag = Math.sqrt(x * x + y * y);
  const prev = _prevSticks[side];

  // Flick detection
  // Fires when stick first crosses FLICK_THRESHOLD (from below), OR when the
  // stick stays above threshold but snaps to a new direction by >90° (rapid reversals).
  if (mag > FLICK_THRESHOLD && now - _flickCooldowns[side] > FLICK_COOLDOWN) {
    const justCrossed = prev.mag < FLICK_THRESHOLD;

    let rapidReversal = false;
    if (!justCrossed && prev.mag >= FLICK_THRESHOLD) {
      const pa = Math.atan2(prev.y, prev.x);
      const ca = Math.atan2(y, x);
      let da = Math.abs(pa - ca);
      if (da > Math.PI) da = 2 * Math.PI - da;
      rapidReversal = da > (Math.PI / 2); // >90° direction change while fully deflected
    }

    if (justCrossed || rapidReversal) {
      const angle = Math.atan2(y, x);
      const direction = _angleToDirection(angle);
      _emit({ type: 'flick', source: side, direction, directionAngle: angle, timestamp: now });
      _flickCooldowns[side] = now;
    }
  }

  // Hold detection
  const hs = _holdState[side];
  if (mag > HOLD_THRESHOLD) {
    const direction = _angleToDirection(Math.atan2(y, x));
    if (!hs.active) {
      hs.start = now;
      hs.active = true;
      hs.direction = direction;
      hs.emitted = false;
    } else if (!hs.emitted && (now - hs.start) > HOLD_DURATION) {
      hs.emitted = true;
      _emit({
        type: 'hold_start',
        source: side,
        direction: hs.direction,
        timestamp: now
      });
    }
    // Track rotation history
    if (_rotationHistory[side].length === 0 || _rotationHistory[side][_rotationHistory[side].length - 1] !== direction) {
      _rotationHistory[side].push(direction);
      if (_rotationHistory[side].length > 8) _rotationHistory[side].shift();
      _checkRotation(side, now);
    }
  } else {
    if (hs.active && hs.emitted) {
      _emit({
        type: 'hold_end',
        source: side,
        direction: hs.direction,
        holdDuration: now - hs.start,
        timestamp: now
      });
    }
    hs.active = false;
    hs.direction = null;
    hs.emitted = false;
    hs.start = 0;
    // Clear rotation history on neutral
    if (_rotationHistory[side].length > 0 && now - hs.start > 1000) {
      _rotationHistory[side] = [];
    }
  }

  _prevSticks[side] = { x, y, mag };
};

const _checkRotation = (side, now) => {
  const history = _rotationHistory[side];
  if (history.length < 2) return; // need at least 2 entries to compute a diff

  const minSteps = Math.round(ROTATION_MIN_ARC / 45); // 90° → 2 steps
  let cwCount = 0;
  let ccwCount = 0;
  const dirOrder = ['UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT'];
  for (let i = 1; i < history.length; i++) {
    const prevIdx = dirOrder.indexOf(history[i - 1]);
    const currIdx = dirOrder.indexOf(history[i]);
    if (prevIdx === -1 || currIdx === -1) continue;
    const diff = (currIdx - prevIdx + 8) % 8;
    if (diff <= 3) cwCount += diff;       // ≤135° step = clockwise
    if (diff >= 5) ccwCount += (8 - diff); // ≥225° step = counter-clockwise
  }
  if (cwCount >= minSteps) {
    _emit({ type: 'rotate_cw', source: side, degrees: cwCount * 45, timestamp: now });
    _rotationHistory[side] = [];
  } else if (ccwCount >= minSteps) {
    _emit({ type: 'rotate_ccw', source: side, degrees: ccwCount * 45, timestamp: now });
    _rotationHistory[side] = [];
  }
};

// ── Keyboard fallback ──
const _onKeyDown = (e) => {
  if (e.repeat) return;
  const token = KEY_MAP[e.code];
  if (!token) return;
  e.preventDefault();
  _kbMode = true;
  const now = performance.now();
  const ctrl = State.get('controller');
  ctrl.activeButtons.add(token);
  Controller.markButtonPressed(token);

  if (token === 'D-Up') {
    _emit({ type: 'flick', source: 'RS', direction: 'UP', directionAngle: _directionToAngle('UP'), timestamp: now });
    _emit({ type: 'button_press', source: 'BUTTON', button: token, value: 1, timestamp: now });
  } else if (token === 'D-Down') {
    _emit({ type: 'flick', source: 'RS', direction: 'DOWN', directionAngle: _directionToAngle('DOWN'), timestamp: now });
    _emit({ type: 'button_press', source: 'BUTTON', button: token, value: 1, timestamp: now });
  } else if (token === 'D-Left') {
    _emit({ type: 'flick', source: 'RS', direction: 'LEFT', directionAngle: _directionToAngle('LEFT'), timestamp: now });
    _emit({ type: 'button_press', source: 'BUTTON', button: token, value: 1, timestamp: now });
  } else if (token === 'D-Right') {
    _emit({ type: 'flick', source: 'RS', direction: 'RIGHT', directionAngle: _directionToAngle('RIGHT'), timestamp: now });
    _emit({ type: 'button_press', source: 'BUTTON', button: token, value: 1, timestamp: now });
  } else {
    _emit({ type: 'button_press', source: 'BUTTON', button: token, value: 1, timestamp: now });
  }
};

const _onKeyUp = (e) => {
  const token = KEY_MAP[e.code];
  if (!token) return;
  e.preventDefault();
  const now = performance.now();
  const ctrl = State.get('controller');
  ctrl.activeButtons.delete(token);
  Controller.markButtonReleased(token);
  _emit({ type: 'button_release', source: 'BUTTON', button: token, value: 0, timestamp: now });
};

// ── Public API ──
export const Input = {
  init() {
    // Gamepad connection lifecycle
    window.addEventListener('gamepadconnected', (e) => {
      State.setPath('controller.isConnected', true);
      State.setPath('controller.gamepadIndex', e.gamepad.index);
      console.log('Gamepad connected:', e.gamepad.id);
      _kbMode = false;
      _startPolling();
    });

    window.addEventListener('gamepaddisconnected', () => {
      State.setPath('controller.isConnected', false);
      State.setPath('controller.gamepadIndex', -1);
      console.log('Gamepad disconnected');
      _stopPolling();
    });

    // Keyboard fallback
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup', _onKeyUp);

    // Check for already-connected gamepad
    const gps = navigator.getGamepads();
    for (const gp of gps) {
      if (gp && gp.mapping === 'standard') {
        State.setPath('controller.isConnected', true);
        State.setPath('controller.gamepadIndex', gp.index);
        _startPolling();
        break;
      }
    }
  },

  onInput(fn) {
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  },

  get isKeyboardMode() { return _kbMode; }
};

const _startPolling = () => {
  if (_rafId) return;
  _prevButtons = new Array(17).fill(false);
  _prevSticks = { LS: { x: 0, y: 0, mag: 0 }, RS: { x: 0, y: 0, mag: 0 } };
  _rafId = requestAnimationFrame(_poll);
};

const _stopPolling = () => {
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
};
