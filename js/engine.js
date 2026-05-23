// ─── engine.js ───────────────────────────────────────────────────────────────
// Practice Engine: session lifecycle, step sequencing, input matching, scoring.

import { State } from './state.js';
import { Data } from './data.js';
import { Controller } from './controller.js';
import { Metronome } from './metronome.js';

const PERFECT_WINDOW = 50;
const GOOD_WINDOW = 150;
const OK_WINDOW = 350;
const STEP_TIMEOUT_MULTIPLIER = 2.0;

const RATING_TO_STATE = {
  perfect: 'perfect',
  good: 'good',
  ok: 'ok',
  late: 'miss',
  miss: 'miss'
};

const RATING_TO_SCORE = {
  perfect: 100,
  good: 75,
  ok: 50,
  late: 25,
  miss: 0
};

const _DIRECTION_ANGLES = {
  RIGHT: 0,
  UP_RIGHT: -Math.PI * 0.25,
  UP: -Math.PI * 0.5,
  UP_LEFT: -Math.PI * 0.75,
  LEFT: Math.PI,
  DOWN_LEFT: Math.PI * 0.75,
  DOWN: Math.PI * 0.5,
  DOWN_RIGHT: Math.PI * 0.25
};

let _steps = [];
let _stepStartTime = 0;
let _stepTimeoutId = null;
let _sessionStartTime = 0;
let _beatCallbackUnsub = null;
let _inputUnsub = null;

const _normalizeAngle = (a) => {
  // Normalize to [-π, π]
  let n = a;
  while (n > Math.PI) n -= 2 * Math.PI;
  while (n < -Math.PI) n += 2 * Math.PI;
  return n;
};

const _directionToAngle = (dir) => {
  const a = _DIRECTION_ANGLES[dir];
  return a !== undefined ? a : 0;
};

// Returns a per-criterion analysis — the single source of truth for match logic.
// Used by onInput for both gating and live UI feedback.
const _analyzeMatch = (inputEvent, step) => {
  const res = {
    // individual checks (null = not applicable / skipped)
    typeOk: false, stickOk: null, dirOk: null, buttonsOk: true,
    // detail for UI
    inputType: inputEvent.type, expectedType: step.type,
    inputStick: inputEvent.source || null, expectedStick: step.controller.stick || null,
    inputDir: inputEvent.direction || null, expectedDir: step.controller.direction || null,
    angleDiff: null, missingBtns: [],
    overall: false
  };

  // ── Type ──
  res.typeOk =
    inputEvent.type === step.type ||
    (step.type === 'hold' && step.controller.stick  && inputEvent.type === 'hold_start') ||
    (step.type === 'hold' && !step.controller.stick && inputEvent.type === 'button_press');

  // ── Stick source ──
  if (step.controller.stick) {
    res.stickOk = inputEvent.source === step.controller.stick;
  }

  // ── Direction (only when both sides supply it) ──
  if (step.controller.direction && inputEvent.direction) {
    const ea = _directionToAngle(step.controller.direction);
    const aa = inputEvent.directionAngle !== undefined
      ? inputEvent.directionAngle
      : _directionToAngle(inputEvent.direction);
    let diff = Math.abs(_normalizeAngle(aa - ea));
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    res.angleDiff = Math.round(diff * (180 / Math.PI));
    res.dirOk = diff <= step.tolerance * (Math.PI / 180);
  }

  // ── Required held buttons ──
  const active = State.get('controller').activeButtons;
  res.missingBtns = (step.controller.buttons || []).filter(b => !active.has(b));
  res.buttonsOk = res.missingBtns.length === 0;

  // overall: every checked criterion must pass (null = unchecked = pass)
  res.overall = res.typeOk && (res.stickOk !== false) && (res.dirOk !== false) && res.buttonsOk;
  return res;
};

// Thin wrapper kept so callers that just need bool still work
const _matchInput = (inputEvent, step) => _analyzeMatch(inputEvent, step).overall;

const _rateTimingDelta = (delta) => {
  const abs = Math.abs(delta);
  if (abs < PERFECT_WINDOW) return 'perfect';
  if (abs < GOOD_WINDOW) return 'good';
  if (abs < OK_WINDOW) return 'ok';
  return delta > 0 ? 'late' : 'late';
};

const _highlightStep = (idx) => {
  if (idx < 0 || idx >= _steps.length) return;

  const step = _steps[idx];
  const session = State.get('session');

  // Clear previous step highlight (if any)
  if (idx > 0) {
    const prev = _steps[idx - 1];
    Controller.highlight(prev.controller.svgTargets, 'idle');
    if (prev.controller.stick) Controller.hideStickArrow(prev.controller.stick);
  }

  // Highlight current step as "next" (upcoming)
  Controller.highlight(step.controller.svgTargets, 'next');

  // Show stick arrow and animate
  if (step.controller.stick && step.controller.direction) {
    Controller.showStickArrow(step.controller.stick, step.controller.direction);
    Controller.animateStickTo(step.controller.stick, step.controller.direction, 0.5);
  }

  // Update state
  State.setPath('session.currentStepIdx', idx);
  _stepStartTime = performance.now();

  // Step timeout (auto-miss). Freeplay waits indefinitely — no auto-miss.
  const bpmEnabled = State.get('settings').bpmEnabled;
  const isFreeplay = session.mode === 'freeplay';
  const beatDuration = 60000 / session.bpm;
  // Floor at 2000ms so a learner always has enough time even at high BPM.
  const timeoutMs = isFreeplay
    ? null
    : bpmEnabled
      ? Math.max(step.beatValue * beatDuration * STEP_TIMEOUT_MULTIPLIER, 2000)
      : 8000;
  if (_stepTimeoutId) clearTimeout(_stepTimeoutId);
  if (timeoutMs !== null) {
    _stepTimeoutId = setTimeout(() => {
      _recordResult({
        stepId: step.id,
        expected: step.type,
        got: null,
        timingDelta: null,
        rating: 'miss',
        score: 0
      });
      Controller.highlight(step.controller.svgTargets, 'miss', 300);
      _advanceStep();
    }, timeoutMs);
  }

  // Dispatch custom event for UI update
  window.dispatchEvent(new CustomEvent('ENGINE_STEP_CHANGE', {
    detail: { step, idx, total: _steps.length }
  }));
};

const _advanceStep = () => {
  if (_stepTimeoutId) {
    clearTimeout(_stepTimeoutId);
    _stepTimeoutId = null;
  }

  const session = State.get('session');
  const nextIdx = session.currentStepIdx + 1;

  // Clean up current step arrows
  const currentStep = _steps[session.currentStepIdx];
  if (currentStep && currentStep.controller.stick) {
    Controller.hideStickArrow(currentStep.controller.stick);
  }

  if (nextIdx >= _steps.length) {
    _completeSession();
  } else {
    _highlightStep(nextIdx);
  }
};

const _recordResult = (result) => {
  const session = State.get('session');
  const results = [...session.results, result];
  State.setPath('session.results', results);
};

const _completeSession = () => {
  const session = State.get('session');
  if (!session.isActive) return;

  const results = session.results;
  const total = results.length;
  if (total === 0) {
    Engine.stop();
    return;
  }

  const sum = results.reduce((s, r) => s + r.score, 0);
  const score = Math.round(sum / total);
  const nonMiss = results.filter(r => r.rating !== 'miss').length;
  const accuracy = Math.round((nonMiss / total) * 100);
  const duration = Date.now() - _sessionStartTime;

  // Stop metronome and controller
  Metronome.stop();
  Controller.resetAll();
  Controller.setLightbar('rgba(0,0,0,0.3)');

  State.setPath('session.isActive', false);
  State.setPath('session.isPaused', false);

  // Dispatch session complete event
  window.dispatchEvent(new CustomEvent('SESSION_COMPLETE', {
    detail: {
      moveId: State.get('selectedMoveId'),
      score, accuracy, results, duration,
      bpm: session.bpm,
      mode: session.mode
    }
  }));
};

// ── Public API ──
export const Engine = {
  init() {
    // Subscribe to input events
    _inputUnsub = window.addEventListener('input_event', (e) => {
      this.onInput(e.detail);
    });
    // Also hook directly into Input module later via app.js
  },

  onInput(inputEvent) {
    const session = State.get('session');
    if (!session.isActive || session.isPaused) return;

    const idx = session.currentStepIdx;
    if (idx < 0 || idx >= _steps.length) return;

    const step = _steps[idx];

    // Only process input types that can match a step (not releases)
    const t = inputEvent.type;
    if (t !== 'button_press' && t !== 'flick' && t !== 'hold_start' &&
        t !== 'rotate_cw' && t !== 'rotate_ccw') return;

    const analysis = _analyzeMatch(inputEvent, step);

    // Dispatch live feedback on every actionable attempt
    window.dispatchEvent(new CustomEvent('ENGINE_INPUT_RECEIVED', {
      detail: { inputEvent, step, analysis, idx }
    }));

    if (analysis.overall) {
      const bpmEnabled = State.get('settings').bpmEnabled;
      const isFreeplay = session.mode === 'freeplay';
      let rating, timingDelta;
      if (bpmEnabled && !isFreeplay) {
        const beatDuration = 60000 / session.bpm;
        const expectedBeatMs = step.beatValue * beatDuration;
        timingDelta = performance.now() - _stepStartTime - expectedBeatMs;
        rating = _rateTimingDelta(timingDelta);
      } else {
        timingDelta = 0;
        rating = 'perfect';
      }
      const score = RATING_TO_SCORE[rating];

      const stateClass = RATING_TO_STATE[rating];
      Controller.highlight(step.controller.svgTargets, stateClass, 400);

      _recordResult({
        stepId: step.id,
        expected: step.type,
        got: inputEvent.type,
        timingDelta: Math.round(timingDelta),
        rating,
        score
      });

      _advanceStep();
    } else if (t === 'button_press' && State.get('settings').strictMode) {
      // Strict mode: wrong input counts as miss
      _recordResult({
        stepId: step.id,
        expected: step.type,
        got: inputEvent.type,
        timingDelta: null,
        rating: 'miss',
        score: 0
      });
      Controller.highlight(step.controller.svgTargets, 'miss', 300);
      _advanceStep();
    }
  },

  start(moveId, options = {}) {
    const move = Data.getMove(moveId);
    if (!move) {
      console.error(`Move "${moveId}" not found`);
      return false;
    }
    if (!move.inputs || move.inputs.length === 0) {
      console.error(`Move "${moveId}" has no input steps`);
      return false;
    }

    const bpm = options.bpm || State.get('settings').bpm || 90;
    const mode = options.mode || 'guided';

    _steps = [...move.inputs];
    _stepStartTime = 0;
    _sessionStartTime = Date.now();

    State.update({
      selectedMoveId: moveId,
      session: {
        isActive: true,
        isPaused: false,
        mode,
        currentStepIdx: 0,
        totalSteps: _steps.length,
        bpm,
        results: [],
        startTime: _sessionStartTime
      }
    });

    Controller.resetAll();
    Controller.setLightbar('rgba(0,100,255,0.6)');

    if (mode === 'guided' && State.get('settings').bpmEnabled) {
      Metronome.start(bpm);
    }

    // Hook up beat callback for visual pulse
    if (_beatCallbackUnsub) _beatCallbackUnsub();
    _beatCallbackUnsub = Metronome.onBeat(() => {
      Controller.pulseBeat();
    });

    _highlightStep(0);
    return true;
  },

  startFreeplay(moveId) {
    return this.start(moveId, { mode: 'freeplay', bpm: 60 });
  },

  // Shared internal startup for drills and sequences
  _startStepList(steps, bpm, stateUpdate) {
    if (steps.length === 0) return false;
    _steps = steps;
    _stepStartTime = 0;
    _sessionStartTime = Date.now();
    State.update({
      ...stateUpdate,
      session: {
        isActive: true,
        isPaused: false,
        mode: 'drill',
        currentStepIdx: 0,
        totalSteps: steps.length,
        bpm,
        results: [],
        startTime: _sessionStartTime
      }
    });
    Controller.resetAll();
    if (State.get('settings').bpmEnabled) Metronome.start(bpm);
    if (_beatCallbackUnsub) _beatCallbackUnsub();
    _beatCallbackUnsub = Metronome.onBeat(() => Controller.pulseBeat());
    _highlightStep(0);
    return true;
  },

  startDrill(drillId) {
    const drill = Data.getDrill(drillId);
    if (!drill) {
      console.error(`Drill "${drillId}" not found`);
      return false;
    }
    const allSteps = [];
    for (const moveId of drill.moves) {
      const move = Data.getMove(moveId);
      if (move && move.inputs) {
        for (let rep = 0; rep < (drill.repetitions || 1); rep++) {
          allSteps.push(...move.inputs);
        }
      }
    }
    if (allSteps.length === 0) {
      console.error('Drill has no valid steps');
      return false;
    }
    const bpm = drill.bpm || State.get('settings').bpm || 90;
    return this._startStepList(allSteps, bpm, { selectedDrillId: drillId });
  },

  startSequence(seqId) {
    const seq = Data.getSequence(seqId);
    if (!seq) {
      console.error(`Sequence "${seqId}" not found`);
      return false;
    }
    const allSteps = [];
    for (const moveId of seq.moves) {
      const move = Data.getMove(moveId);
      if (move && move.inputs) allSteps.push(...move.inputs);
    }
    if (allSteps.length === 0) {
      console.error('Sequence has no valid steps');
      return false;
    }
    const bpm = State.get('settings').bpm || 90;
    return this._startStepList(allSteps, bpm, { selectedSequenceId: seqId });
  },

  pause() {
    State.setPath('session.isPaused', true);
    Metronome.pause();
  },

  resume() {
    State.setPath('session.isPaused', false);
    Metronome.resume();
  },

  stop() {
    State.setPath('session.isActive', false);
    State.setPath('session.isPaused', false);
    State.setPath('session.results', []);

    Metronome.stop();
    Controller.resetAll();
    Controller.setLightbar('rgba(0,0,0,0.3)');

    if (_stepTimeoutId) {
      clearTimeout(_stepTimeoutId);
      _stepTimeoutId = null;
    }
    if (_beatCallbackUnsub) {
      _beatCallbackUnsub();
      _beatCallbackUnsub = null;
    }

    _steps = [];
  },

  isActive() {
    return State.get('session').isActive;
  },

  getCurrentStep() {
    const idx = State.get('session').currentStepIdx;
    return _steps[idx] || null;
  }
};
