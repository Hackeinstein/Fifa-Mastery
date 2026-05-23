// ─── training.js ──────────────────────────────────────────────────────────────
// Reaction time test and joystick coordination training.

import { Controller } from './controller.js';

const BUTTONS = ['✕', '◯', '□', '△', 'L1', 'R1'];
const BTN_SVG = { '✕': 'CROSS', '◯': 'CIRCLE', '□': 'SQUARE', '△': 'TRIANGLE', 'L1': 'L1', 'R1': 'R1' };
const DIRS_CARD = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const DIRS_ALL  = ['UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT'];
const DIR_ANGLES = {
  RIGHT: 0, UP_RIGHT: -Math.PI * 0.25, UP: -Math.PI * 0.5,
  UP_LEFT: -Math.PI * 0.75, LEFT: Math.PI, DOWN_LEFT: Math.PI * 0.75,
  DOWN: Math.PI * 0.5, DOWN_RIGHT: Math.PI * 0.25
};

const _rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const _pick  = (arr) => arr[_rand(0, arr.length - 1)];
const _norm  = (a) => { let n = a; while (n > Math.PI) n -= 2 * Math.PI; while (n < -Math.PI) n += 2 * Math.PI; return n; };
const _dang  = (dir) => DIR_ANGLES[dir] ?? 0;

let _active    = false;
let _mode      = null;
let _round     = 0;
let _maxRounds = 10;
let _results   = [];
let _stimulus  = null;
let _stimAt    = 0;
let _waiting   = false;
let _tid       = null;
let _listeners = [];

const _emit = (e) => { for (const fn of _listeners) { try { fn(e); } catch (_) {} } };
const _clearTid = () => { if (_tid) { clearTimeout(_tid); _tid = null; } };

const _scheduleNext = () => {
  if (!_active || _round >= _maxRounds) { _complete(); return; }
  _emit({ type: 'waiting', round: _round, total: _maxRounds });
  _tid = setTimeout(_show, _rand(700, 2200));
};

const _show = () => {
  if (!_active) return;
  let s;
  switch (_mode) {
    case 'reaction_button': {
      const btn = _pick(BUTTONS);
      s = { kind: 'button', value: btn, svg: BTN_SVG[btn] };
      Controller.highlight([s.svg], 'next');
      break;
    }
    case 'reaction_stick': {
      const dir = _pick(DIRS_CARD);
      s = { kind: 'stick', value: dir, side: 'RS' };
      Controller.showStickArrow('RS', dir);
      break;
    }
    case 'coord_rs':
    case 'coord_ls': {
      const dir = _pick(DIRS_ALL);
      const side = _mode === 'coord_rs' ? 'RS' : 'LS';
      s = { kind: 'stick', value: dir, side };
      Controller.showStickArrow(side, dir);
      break;
    }
    default: return;
  }
  _stimulus = s;
  _stimAt   = performance.now();
  _waiting  = true;
  _emit({ type: 'stimulus', stimulus: s, round: _round, total: _maxRounds });
  // Auto-miss after 3 s
  _tid = setTimeout(() => {
    if (_waiting) _record({ rt: 3000, correct: false, expected: s.value, got: null, timeout: true });
  }, 3000);
};

const _record = (res) => {
  _clearTid();
  _waiting = false;
  if (_stimulus) {
    if (_stimulus.kind === 'button') {
      Controller.highlight([_stimulus.svg], res.correct ? 'perfect' : 'miss', 600);
    } else {
      Controller.hideStickArrow(_stimulus.side);
    }
  }
  _results.push(res);
  _round++;
  _emit({ type: 'result', result: res, round: _round, total: _maxRounds, results: [..._results] });
  setTimeout(_scheduleNext, 700);
};

const _complete = () => {
  _active = false;
  _clearTid();
  Controller.resetAll();
  _emit({ type: 'complete', results: [..._results] });
};

export const Training = {
  start(mode, rounds = 10) {
    if (_active) this.stop();
    _mode      = mode;
    _active    = true;
    _round     = 0;
    _maxRounds = rounds;
    _results   = [];
    _waiting   = false;
    Controller.resetAll();
    Controller.setLightbar('rgba(16, 185, 129, 0.5)');
    _scheduleNext();
  },

  stop() {
    _active  = false;
    _waiting = false;
    _clearTid();
    Controller.resetAll();
    _emit({ type: 'stopped' });
  },

  onInput(inputEvent) {
    if (!_active || !_waiting || !_stimulus) return;
    const rt = Math.round(performance.now() - _stimAt);

    if (_stimulus.kind === 'button' && inputEvent.type === 'button_press') {
      const correct = inputEvent.button === _stimulus.value;
      _record({ rt, correct, expected: _stimulus.value, got: inputEvent.button });

    } else if (_stimulus.kind === 'stick' && inputEvent.type === 'flick') {
      const correct = inputEvent.direction === _stimulus.value;
      let angleDiff = 0;
      if (inputEvent.directionAngle !== undefined) {
        const ea = _dang(_stimulus.value);
        let diff = Math.abs(_norm(inputEvent.directionAngle - ea));
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        angleDiff = Math.round(diff * (180 / Math.PI));
      }
      _record({ rt, correct, expected: _stimulus.value, got: inputEvent.direction, angleDiff });
    }
  },

  onChange(fn) {
    _listeners.push(fn);
    return () => { const i = _listeners.indexOf(fn); if (i !== -1) _listeners.splice(i, 1); };
  },

  calcStats(results) {
    const valid = results.filter(r => r.correct && r.rt < 2999);
    if (!valid.length) return { avg: null, best: null, accuracy: 0, avgAngle: null };
    const avg   = Math.round(valid.reduce((s, r) => s + r.rt, 0) / valid.length);
    const best  = Math.min(...valid.map(r => r.rt));
    const accuracy = Math.round((valid.length / results.length) * 100);
    const withAngle = valid.filter(r => r.angleDiff !== undefined);
    const avgAngle  = withAngle.length
      ? Math.round(withAngle.reduce((s, r) => s + r.angleDiff, 0) / withAngle.length)
      : null;
    return { avg, best, accuracy, avgAngle };
  },

  rtRank(avg) {
    if (avg == null) return '—';
    if (avg < 160) return 'PRO';
    if (avg < 210) return 'FAST';
    if (avg < 270) return 'GOOD';
    if (avg < 350) return 'SLOW';
    return 'LATE';
  },

  get isActive() { return _active; },
  get mode()     { return _mode; }
};
