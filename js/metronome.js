// ─── metronome.js ────────────────────────────────────────────────────────────
// Web Audio API BPM clock with scheduler-ahead pattern. Precise, drift-free.

import { State } from './state.js';

const LOOKAHEAD = 25;
const SCHEDULE_WINDOW = 0.1;

let _audioCtx = null;
let _intervalId = null;
let _nextBeatTime = 0;
let _beatNumber = 0;
let _bpm = 90;
let _isRunning = false;
let _beatCallbacks = [];

const _createAudioContext = () => {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
};

const _scheduleClick = (time, beatNum) => {
  const ctx = _audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1000;
  // Accented first beat
  if (beatNum % 4 === 0) {
    osc.frequency.value = 1200;
    gain.gain.value = 0.4 * (State.get('settings').volume || 0.5);
  } else {
    gain.gain.value = 0.25 * (State.get('settings').volume || 0.5);
  }
  osc.start(time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  osc.stop(time + 0.03);

  // Fire beat callback right before the scheduled time
  const now = performance.now();
  const delayMs = (time - ctx.currentTime) * 1000;
  setTimeout(() => {
    for (const fn of _beatCallbacks) {
      try { fn(beatNum, time); } catch (e) { console.warn('Beat callback error:', e); }
    }
  }, Math.max(0, delayMs - 10));
};

const _scheduler = () => {
  if (!_isRunning) return;
  const ctx = _audioCtx;
  if (!ctx) return;
  while (_nextBeatTime < ctx.currentTime + SCHEDULE_WINDOW) {
    _scheduleClick(_nextBeatTime, _beatNumber);
    const beatDuration = 60 / _bpm;
    _nextBeatTime += beatDuration;
    _beatNumber++;
  }
  State.setPath('metronome.beat', _beatNumber);
};

export const Metronome = {
  start(bpm) {
    _bpm = bpm || _bpm;
    _createAudioContext();
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    _nextBeatTime = _audioCtx.currentTime + 0.05;
    _beatNumber = 0;
    _isRunning = true;
    State.setPath('metronome.isRunning', true);
    State.setPath('metronome.bpm', _bpm);
    State.setPath('metronome.beat', 0);
    _intervalId = setInterval(_scheduler, LOOKAHEAD);
  },

  stop() {
    _isRunning = false;
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    State.setPath('metronome.isRunning', false);
  },

  pause() {
    if (_audioCtx && _audioCtx.state === 'running') {
      _audioCtx.suspend();
    }
    _isRunning = false;
    State.setPath('metronome.isRunning', false);
  },

  resume() {
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    _isRunning = true;
    State.setPath('metronome.isRunning', true);
    _nextBeatTime = _audioCtx.currentTime + 0.05;
    _intervalId = setInterval(_scheduler, LOOKAHEAD);
  },

  setBPM(bpm) {
    _bpm = Math.max(40, Math.min(200, bpm));
    State.setPath('metronome.bpm', _bpm);
  },

  onBeat(fn) {
    _beatCallbacks.push(fn);
    return () => {
      const idx = _beatCallbacks.indexOf(fn);
      if (idx !== -1) _beatCallbacks.splice(idx, 1);
    };
  },

  get bpm() { return _bpm; },
  get isRunning() { return _isRunning; },

  // Tap tempo support
  _tapTimes: [],
  tapTempo() {
    const now = performance.now();
    const times = this._tapTimes;
    times.push(now);
    if (times.length > 4) times.shift();
    if (times.length >= 2) {
      let total = 0;
      for (let i = 1; i < times.length; i++) {
        total += times[i] - times[i - 1];
      }
      const avgMs = total / (times.length - 1);
      const bpm = Math.round(60000 / avgMs);
      this.setBPM(bpm);
      return bpm;
    }
    return _bpm;
  }
};
