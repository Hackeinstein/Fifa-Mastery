// ─── state.js ─────────────────────────────────────────────────────────────────
// Reactive pub/sub store — single source of truth for all runtime state.

const INITIAL_STATE = {
  db: null,
  currentView: 'library',
  selectedMoveId: null,
  selectedSequenceId: null,
  selectedDrillId: null,
  session: {
    isActive: false,
    isPaused: false,
    mode: 'guided',
    currentStepIdx: 0,
    totalSteps: 0,
    bpm: 90,
    results: [],
    startTime: null
  },
  controller: {
    isConnected: false,
    gamepadIndex: -1,
    activeButtons: new Set(),
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    l2Value: 0,
    r2Value: 0
  },
  metronome: {
    isRunning: false,
    bpm: 90,
    beat: 0
  },
  user: null,
  moveStats: {},
  settings: {
    bpm: 90,
    volume: 0.5,
    showHints: true,
    strictMode: false
  }
};

const createStore = (initial) => {
  const listeners = new Map();
  let _state = structuredClone(initial);
  // Preserve the Set for activeButtons
  _state.controller.activeButtons = new Set();

  const notify = (key) => {
    const fns = listeners.get(key);
    if (fns) {
      for (let i = 0; i < fns.length; i++) {
        try { fns[i](_state[key], _state); } catch (e) { console.warn('State subscriber error:', e); }
      }
    }
    const wildcards = listeners.get('*');
    if (wildcards) {
      for (let i = 0; i < wildcards.length; i++) {
        try { wildcards[i](_state); } catch (e) { console.warn('State wildcard subscriber error:', e); }
      }
    }
  };

  return {
    get(key) {
      return _state[key];
    },

    getAll() {
      return structuredClone(_state);
    },

    set(key, val) {
      _state[key] = val;
      notify(key);
    },

    update(partial) {
      Object.assign(_state, partial);
      for (const key of Object.keys(partial)) {
        notify(key);
      }
    },

    setPath(path, val) {
      const keys = path.split('.');
      let ref = _state;
      for (let i = 0; i < keys.length - 1; i++) {
        ref = ref[keys[i]];
      }
      ref[keys[keys.length - 1]] = val;
      notify(keys[0]);
    },

    subscribe(key, fn) {
      if (!listeners.has(key)) listeners.set(key, []);
      const fns = listeners.get(key);
      fns.push(fn);
      return () => {
        const idx = fns.indexOf(fn);
        if (idx !== -1) fns.splice(idx, 1);
      };
    }
  };
};

export const State = createStore(INITIAL_STATE);
