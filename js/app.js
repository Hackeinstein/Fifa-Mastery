// ─── app.js ──────────────────────────────────────────────────────────────────
// Bootstrap: init sequence, page routing, global error handling.
// Used by pad.html to wire all modules together.

import { State } from './state.js';
import { Data } from './data.js';
import { Engine } from './engine.js';
import { Controller } from './controller.js';
import { Input } from './input.js';
import { Metronome } from './metronome.js';
import { Stats } from './stats.js';
import { UI } from './ui.js';
import { Training } from './training.js';

let _currentFilter = { stars: [], category: 'all', search: '', sortBy: 'name', sortDir: 'asc' };
let _moveStatsMap = {};
let _libraryView = 'moves'; // 'moves' | 'sequences' | 'drills'

// ── Input remap label helpers ──
// Build the inverse map: action-token → physical-button
const _invertMap = (map) => {
  const inv = {};
  for (const [physical, action] of Object.entries(map)) inv[action] = physical;
  return inv;
};

// Replace button symbols in a label string using the inverse map
const _remapText = (text, invMap) => {
  // Longest tokens first to prevent partial replacements (L1/R1 before L/R)
  const tokens = ['L1', 'R1', 'L2', 'R2', '✕', '◯', '□', '△'];
  let result = text;
  for (const tok of tokens) {
    if (invMap[tok] && invMap[tok] !== tok) {
      result = result.split(tok).join(invMap[tok]);
    }
  }
  return result;
};

// Return a display-ready copy of a step with labels and button names remapped
const _remapStepForDisplay = (step, inputMap) => {
  if (!inputMap || Object.keys(inputMap).length === 0) return step;
  const inv = _invertMap(inputMap);
  return {
    ...step,
    label: _remapText(step.label, inv),
    controller: {
      ...step.controller,
      buttons: (step.controller.buttons || []).map(b => inv[b] || b)
    }
  };
};

// ── Init ──
const _init = async () => {
  console.log('PS5 Pad Mastery — Initializing...');

  // Load data
  try {
    const db = await Data.load();
    console.log(`Loaded ${db.moves.length} moves, ${db.sequences?.length || 0} sequences, ${db.drills?.length || 0} drills`);
  } catch (err) {
    console.error('Failed to load data:', err);
    UI.toast('Failed to load moves data. Check console.', 'error', 5000);
    return;
  }

  // Load stats from localStorage
  const { moveStats, sessions, user, settings } = Stats.loadAll();
  _moveStatsMap = moveStats;
  State.update({ moveStats, user, settings });

  // Init controller SVG
  const svgEl = document.getElementById('pad-svg');
  if (svgEl) Controller.init(svgEl);

  // Init input system
  Input.init();

  // Connect input events to engine + training
  Input.onInput((event) => {
    Engine.onInput(event);
    if (Training.isActive) Training.onInput(event);
  });

  // Also listen for custom input_event for keyboard
  window.addEventListener('input_event', (e) => {
    Engine.onInput(e.detail);
    if (Training.isActive) Training.onInput(e.detail);
  });

  // Session complete handler
  window.addEventListener('SESSION_COMPLETE', (e) => {
    const { moveId, score, accuracy, results, duration, bpm } = e.detail;
    const xpResult = Stats.recordSession({ moveId, score, accuracy, results, duration, bpm });
    _moveStatsMap = Stats.loadAll().moveStats; // Refresh

    const overlay = UI.showScoreOverlay(score, accuracy, results, { xpGained: xpResult.xpGained, leveledUp: xpResult.leveledUp, newLevel: xpResult.newLevel });

    const _closeToLibrary = () => { UI.hideScoreOverlay(); _showLibrary(); };

    overlay.querySelector('.btn-score-retry')?.addEventListener('click', () => {
      UI.hideScoreOverlay();
      _startPractice(moveId, 'guided');
    });
    overlay.querySelector('.btn-score-library')?.addEventListener('click', _closeToLibrary);
    overlay.querySelector('.btn-score-close')?.addEventListener('click', _closeToLibrary);
    // Click the dark backdrop (not the card) to dismiss
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _closeToLibrary();
    });

    // Refresh library after session
    _renderLibrary();
  });

  // Listen for step changes
  window.addEventListener('ENGINE_STEP_CHANGE', (e) => {
    const { step, idx, total } = e.detail;
    const results = State.get('session').results;
    const inputMap = State.get('settings').inputMap || {};
    UI.updateStepPanel(_remapStepForDisplay(step, inputMap), idx, total, results);
  });

  // Live input feedback
  window.addEventListener('ENGINE_INPUT_RECEIVED', (e) => {
    UI.updateLiveSection(e.detail);
  });

  // Controller connection UI updates
  State.subscribe('controller', (ctrl) => {
    UI.setConnectionStatus(ctrl.isConnected, '');
  });

  // Metronome beat updates for visual beat dots
  State.subscribe('metronome', (metro) => {
    const beatDots = document.getElementById('beat-dots');
    if (beatDots && metro.isRunning) {
      const beatMod = metro.beat % 4;
      const dots = beatDots.querySelectorAll('.beat-dot');
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === beatMod);
      });
    }
  });

  // ── Build UI ──
  _setupLibraryPanel();
  _setupHeaderControls();
  _setupSettingsPanel();
  _setupInputMapping();
  _setupStatsPanel();
  _setupBpmToggle();
  _setupTrainingTabs();
  _renderLibrary();

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Dismiss score overlay first (highest priority), then panels
      if (document.querySelector('.score-overlay')) {
        UI.hideScoreOverlay();
        _showLibrary();
        return;
      }
      const statsPanel = document.getElementById('stats-panel');
      const settingsPanel = document.getElementById('settings-panel');
      if (statsPanel && !statsPanel.classList.contains('hidden')) { statsPanel.classList.add('hidden'); return; }
      if (settingsPanel && !settingsPanel.classList.contains('hidden')) { settingsPanel.classList.add('hidden'); return; }
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const bpm = State.get('settings').bpm;
      _updateBPM(Math.min(200, bpm + 5));
    }
    if (e.key === '-') {
      e.preventDefault();
      const bpm = State.get('settings').bpm;
      _updateBPM(Math.max(40, bpm - 5));
    }
  });

  // Before unload: clean up
  window.addEventListener('beforeunload', () => {
    if (Engine.isActive()) Engine.stop();
  });

  console.log('PS5 Pad Mastery — Ready');
};

// ── Library Panel ──
const _setupLibraryPanel = () => {
  const searchInput = document.getElementById('search-moves');
  const catFilter = document.getElementById('filter-category');
  const starFilters = document.querySelectorAll('.star-filter-btn');
  const libraryGrid = document.getElementById('library-grid');
  const detailPanel = document.getElementById('detail-panel');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _currentFilter.search = searchInput.value;
      _renderLibrary();
    });
  }

  if (catFilter) {
    const cats = Data.getCategories();
    let html = '<option value="all">All Categories</option>';
    for (const cat of cats) {
      const label = { feint: 'Feint', stepover: 'Stepover', ball_roll: 'Ball Roll', roulette: 'Roulette', elastico: 'Elastico', rainbow: 'Rainbow', la_croqueta: 'La Croqueta', combo: 'Combo', fake: 'Fake', chop: 'Chop' }[cat] || cat;
      html += `<option value="${cat}">${label}</option>`;
    }
    catFilter.innerHTML = html;
    catFilter.addEventListener('change', () => {
      _currentFilter.category = catFilter.value;
      _renderLibrary();
    });
  }

  if (starFilters) {
    const selectedStars = new Set();
    starFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        const star = parseInt(btn.dataset.star);
        if (selectedStars.has(star)) {
          selectedStars.delete(star);
          btn.classList.remove('ring-2', 'ring-cyan-400');
        } else {
          selectedStars.add(star);
          btn.classList.add('ring-2', 'ring-cyan-400');
        }
        _currentFilter.stars = [...selectedStars];
        _renderLibrary();
      });
    });
  }

  // Library view toggle (Moves / Sequences / Drills)
  document.querySelectorAll('.lib-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _libraryView = btn.dataset.view;
      document.querySelectorAll('.lib-view-btn').forEach(b => {
        const active = b === btn;
        b.style.background = active ? '#06b6d4' : '';
        b.style.color = active ? '#000' : '';
        b.style.borderColor = active ? '#06b6d4' : '';
      });
      const movesFilters = document.getElementById('moves-filters');
      if (movesFilters) movesFilters.style.display = _libraryView === 'moves' ? '' : 'none';
      _renderLibrary();
    });
  });

  // Delegated click on library grid cards
  if (libraryGrid) {
    libraryGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.move-card');
      if (!card) return;
      if (card.dataset.moveId) {
        _showMoveDetail(card.dataset.moveId);
      } else if (card.dataset.seqId) {
        _startSequence(card.dataset.seqId);
      } else if (card.dataset.drillId) {
        _startDrill(card.dataset.drillId);
      }
    });
  }

  // Delegated click for detail panel buttons
  if (detailPanel) {
    detailPanel.addEventListener('click', (e) => {
      const guidedBtn = e.target.closest('#btn-practice-guided');
      const freeplayBtn = e.target.closest('#btn-practice-freeplay');
      const backBtn = e.target.closest('#btn-back-library');
      if (guidedBtn) {
        const moveId = guidedBtn.dataset.moveId;
        _startPractice(moveId, 'guided');
      }
      if (freeplayBtn) {
        const moveId = freeplayBtn.dataset.moveId;
        _startPractice(moveId, 'freeplay');
      }
      if (backBtn) {
        _showLibrary();
      }
    });
  }

  // Stop session button in step panel
  const stepPanel = document.getElementById('step-panel');
  if (stepPanel) {
    stepPanel.addEventListener('click', (e) => {
      if (e.target.closest('#btn-stop-session')) {
        Engine.stop();
        _showLibrary();
        UI.toast('Session ended', 'info', 2000);
      }
    });
  }
};

// ── Show Move Detail ──
const _showMoveDetail = (moveId) => {
  const move = Data.getMove(moveId);
  if (!move) return;
  const stats = _moveStatsMap[moveId];
  State.set('selectedMoveId', moveId);
  State.set('currentView', 'detail');

  const detailPanel = document.getElementById('detail-panel');
  const libraryPanel = document.getElementById('library-panel');
  const stepPanel = document.getElementById('step-panel');

  if (detailPanel) {
    // Remap step labels to match the active button layout
    const inputMap = State.get('settings').inputMap || {};
    const displayMove = Object.keys(inputMap).length > 0
      ? { ...move, inputs: move.inputs.map(s => _remapStepForDisplay(s, inputMap)) }
      : move;
    detailPanel.innerHTML = UI.renderMoveDetail(displayMove, stats);
    detailPanel.classList.remove('hidden');
  }
  if (libraryPanel) libraryPanel.classList.add('hidden');
  if (stepPanel) stepPanel.classList.add('hidden');
};

// ── Show Library ──
const _showLibrary = () => {
  State.set('currentView', 'library');
  State.set('selectedMoveId', null);
  const detailPanel = document.getElementById('detail-panel');
  const libraryPanel = document.getElementById('library-panel');
  const stepPanel = document.getElementById('step-panel');
  if (detailPanel) detailPanel.classList.add('hidden');
  if (libraryPanel) libraryPanel.classList.remove('hidden');
  if (stepPanel) stepPanel.classList.add('hidden');
  _renderLibrary();
};

// ── Render Library Grid ──
const _renderLibrary = () => {
  const grid = document.getElementById('library-grid');
  if (!grid) return;

  if (_libraryView === 'sequences') {
    const db = Data.isLoaded ? Data.getMoves({}) : [];
    const movesMap = Object.fromEntries(db.map(m => [m.id, m]));
    const seqs = Data._getAll()?.sequences || [];
    grid.innerHTML = seqs.length
      ? seqs.map(s => UI.renderSequenceCard(s, movesMap)).join('')
      : '<div style="padding:2rem;text-align:center;color:var(--text-muted);">No sequences found</div>';
  } else if (_libraryView === 'drills') {
    const db = Data.isLoaded ? Data.getMoves({}) : [];
    const movesMap = Object.fromEntries(db.map(m => [m.id, m]));
    const drills = Data._getAll()?.drills || [];
    grid.innerHTML = drills.length
      ? drills.map(d => UI.renderDrillCard(d, movesMap)).join('')
      : '<div style="padding:2rem;text-align:center;color:var(--text-muted);">No drills found</div>';
  } else {
    const moves = Data.getMoves(_currentFilter);
    grid.innerHTML = UI.renderLibrary(moves, _currentFilter, _moveStatsMap);
  }
};

// ── Show practice step panel ──
const _switchToPractice = () => {
  document.getElementById('detail-panel')?.classList.add('hidden');
  document.getElementById('library-panel')?.classList.add('hidden');
  document.getElementById('step-panel')?.classList.remove('hidden');
  State.set('currentView', 'practice');
  _updateBPMDisplay(State.get('settings').bpm);
};

// ── Start Practice ──
const _startPractice = (moveId, mode) => {
  if (!Data.getMove(moveId)) return;
  _switchToPractice();
  const bpm = State.get('settings').bpm;
  if (mode === 'freeplay') {
    Engine.startFreeplay(moveId);
  } else {
    Engine.start(moveId, { bpm, mode: 'guided' });
  }
};

// ── Start Sequence ──
const _startSequence = (seqId) => {
  _switchToPractice();
  if (!Engine.startSequence(seqId)) {
    _showLibrary();
    UI.toast('Sequence could not start', 'error', 2000);
  }
};

// ── Start Drill ──
const _startDrill = (drillId) => {
  _switchToPractice();
  if (!Engine.startDrill(drillId)) {
    _showLibrary();
    UI.toast('Drill could not start', 'error', 2000);
  }
};

// ── Header Controls ──
const _setupHeaderControls = () => {
  const bpmSlider = document.getElementById('bpm-slider');
  const bpmDisplay = document.getElementById('bpm-display');
  const btnBpmDown = document.getElementById('btn-bpm-down');
  const btnBpmUp = document.getElementById('btn-bpm-up');
  const btnTapTempo = document.getElementById('btn-tap-tempo');
  const btnSettings = document.getElementById('btn-settings');
  const btnStats = document.getElementById('btn-stats');

  const bpm = State.get('settings').bpm;
  if (bpmSlider) bpmSlider.value = bpm;
  _updateBPMDisplay(bpm);

  if (bpmSlider) {
    bpmSlider.addEventListener('input', () => {
      const val = parseInt(bpmSlider.value);
      _updateBPM(val);
    });
  }
  if (btnBpmDown) {
    btnBpmDown.addEventListener('click', () => {
      const val = Math.max(40, State.get('settings').bpm - 5);
      _updateBPM(val);
    });
  }
  if (btnBpmUp) {
    btnBpmUp.addEventListener('click', () => {
      const val = Math.min(200, State.get('settings').bpm + 5);
      _updateBPM(val);
    });
  }
  if (btnTapTempo) {
    btnTapTempo.addEventListener('click', () => {
      const bpm = Metronome.tapTempo();
      _updateBPM(bpm);
      UI.toast(`Tempo: ${bpm} BPM`, 'info', 1500);
    });
  }
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      const panel = document.getElementById('settings-panel');
      if (panel) panel.classList.toggle('hidden');
      const stats = document.getElementById('stats-panel');
      if (stats) stats.classList.add('hidden');
    });
  }
  if (btnStats) {
    btnStats.addEventListener('click', () => {
      const panel = document.getElementById('stats-panel');
      if (panel) panel.classList.toggle('hidden');
      const settings = document.getElementById('settings-panel');
      if (settings) settings.classList.add('hidden');
      _refreshStatsPanel();
    });
  }
};

const _updateBPM = (bpm) => {
  const slider = document.getElementById('bpm-slider');
  if (slider) slider.value = bpm;
  _updateBPMDisplay(bpm);
  State.setPath('settings.bpm', bpm);
  Metronome.setBPM(bpm);
  Stats.saveSettings(State.get('settings'));
};

const _updateBPMDisplay = (bpm) => {
  const display = document.getElementById('bpm-display');
  if (display) display.textContent = bpm;
};

// ── Settings Panel ──
const _setupSettingsPanel = () => {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-setting]');
    if (!toggle) return;

    const key = toggle.dataset.setting;
    const settings = State.get('settings');
    if (key === 'strictMode' || key === 'showHints') {
      settings[key] = toggle.checked;
      State.set('settings', { ...settings });
      Stats.saveSettings(settings);
    }
    if (key === 'volume') {
      settings.volume = parseFloat(toggle.value);
      State.set('settings', { ...settings });
      Stats.saveSettings(settings);
    }
  });

  // Pre-populate
  const settings = State.get('settings');
  const strictToggle = panel.querySelector('[data-setting="strictMode"]');
  const hintsToggle = panel.querySelector('[data-setting="showHints"]');
  const volumeSlider = panel.querySelector('[data-setting="volume"]');
  if (strictToggle) strictToggle.checked = settings.strictMode;
  if (hintsToggle) hintsToggle.checked = settings.showHints;
  if (volumeSlider) volumeSlider.value = settings.volume;
};

// ── Input Mapping ──
const REMAPPABLE_TOKENS = ['✕', '◯', '□', '△', 'L1', 'R1', 'L2', 'R2'];
const LAYOUT_PRESETS = {
  standard: {},
  alt: { '✕': '◯', '◯': '✕' }  // swap face buttons — typical "Custom A" in football games
};

const _setupInputMapping = () => {
  const ON = '#06b6d4';
  const OFF = 'rgba(255,255,255,0.08)';

  const _stylePresetBtns = (active) => {
    document.querySelectorAll('.layout-preset-btn').forEach(btn => {
      const isActive = btn.dataset.preset === active;
      btn.style.borderColor = isActive ? ON : OFF;
      btn.style.color = isActive ? ON : '#6b7280';
    });
  };

  const _setDesc = (preset) => {
    const el = document.getElementById('layout-desc');
    if (!el) return;
    if (preset === 'standard') el.textContent = 'Default PS5 layout — no remapping';
    else if (preset === 'alt') el.textContent = '✕↔◯ swapped (typical Custom A)';
    else el.textContent = 'Define your own mapping below';
  };

  const _buildCustomGrid = () => {
    const grid = document.getElementById('input-map-grid');
    if (!grid) return;
    const map = State.get('settings').inputMap || {};
    grid.innerHTML = REMAPPABLE_TOKENS.map(physical => {
      const current = map[physical] || physical;
      const opts = REMAPPABLE_TOKENS.map(t =>
        `<option value="${t}"${t === current ? ' selected' : ''}>${t}</option>`
      ).join('');
      return `<div style="display:flex;align-items:center;gap:6px;">
        <span style="width:28px;text-align:right;font-size:0.7rem;color:var(--text-muted);">${physical}</span>
        <span style="font-size:0.65rem;color:#6b7280;">→</span>
        <select data-physical="${physical}" class="input-remap-select"
          style="flex:1;background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:4px;
                 color:#e0e0e8;font-size:0.65rem;padding:2px 4px;outline:none;cursor:pointer;">${opts}</select>
      </div>`;
    }).join('');

    grid.querySelectorAll('.input-remap-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const s = State.get('settings');
        s.inputMap = s.inputMap || {};
        s.inputMap[sel.dataset.physical] = sel.value;
        State.set('settings', { ...s });
        Stats.saveSettings(s);
      });
    });
  };

  const _applyPreset = (preset) => {
    const s = State.get('settings');
    s.layoutPreset = preset;
    if (preset !== 'custom') s.inputMap = { ...(LAYOUT_PRESETS[preset] || {}) };
    State.set('settings', { ...s });
    Stats.saveSettings(s);
    _stylePresetBtns(preset);
    _setDesc(preset);
    const grid = document.getElementById('input-map-grid');
    if (grid) {
      grid.style.display = preset === 'custom' ? 'block' : 'none';
      if (preset === 'custom') _buildCustomGrid();
    }
  };

  document.querySelectorAll('.layout-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => _applyPreset(btn.dataset.preset));
  });

  _applyPreset(State.get('settings').layoutPreset || 'standard');
};

// ── Stats Panel ──
const _setupStatsPanel = () => {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    if (e.target.closest('#btn-reset-stats')) {
      if (confirm('Reset all progress? This cannot be undone.')) {
        Stats.resetAll();
        _moveStatsMap = {};
        UI.toast('All progress reset', 'info', 2000);
        _refreshStatsPanel();
        _renderLibrary();
      }
    }
  });
};

const _refreshStatsPanel = () => {
  const panel = document.getElementById('stats-panel');
  const content = document.getElementById('stats-content');
  if (!panel || !content) return;
  const { moveStats, sessions, user } = Stats.loadAll();
  content.innerHTML = UI.renderStats(moveStats, sessions, user);
  panel.classList.remove('hidden');
};

// ── BPM Toggle ──
const _setupBpmToggle = () => {
  const toggleBtn = document.getElementById('btn-bpm-toggle');
  const controls  = document.getElementById('bpm-controls');
  if (!toggleBtn || !controls) return;

  const _apply = (enabled) => {
    controls.style.display = enabled ? 'flex' : 'none';
    if (enabled) {
      toggleBtn.classList.add('border-[#06b6d4]', 'text-[#06b6d4]');
      toggleBtn.classList.remove('text-[#6b7280]');
    } else {
      toggleBtn.classList.remove('border-[#06b6d4]', 'text-[#06b6d4]');
      toggleBtn.classList.add('text-[#6b7280]');
      Metronome.stop();
    }
    const s = State.get('settings');
    s.bpmEnabled = enabled;
    State.set('settings', { ...s });
    Stats.saveSettings(s);
  };

  // Restore saved state
  _apply(State.get('settings').bpmEnabled ?? false);

  toggleBtn.addEventListener('click', () => {
    _apply(controls.style.display === 'none' || controls.style.display === '');
  });
};

// ── Training Tabs ──
let _trainingMode   = 'reaction_button';
let _trainingRounds = 10;
let _trainingUnsub  = null;

const _setupTrainingTabs = () => {
  ['skills', 'reaction', 'coord'].forEach(tab => {
    document.getElementById(`tab-${tab}`)?.addEventListener('click', () => _switchTab(tab));
  });
};

const _switchTab = (tab) => {
  const library  = document.getElementById('library-panel');
  const training = document.getElementById('training-panel');

  ['skills', 'reaction', 'coord'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (!btn) return;
    const isActive = t === tab;
    const isCoord = t === 'coord';
    btn.style.background    = isActive ? (isCoord ? '#10b981' : '#06b6d4') : '';
    btn.style.color         = isActive ? '#000' : '';
    btn.style.borderColor   = isActive ? (isCoord ? '#10b981' : '#06b6d4') : '';
  });

  if (tab === 'skills') {
    if (Training.isActive) Training.stop();
    library?.classList.remove('hidden');
    if (training) training.style.display = 'none';
  } else {
    if (Engine.isActive()) Engine.stop();
    if (Training.isActive) { Training.stop(); if (_trainingUnsub) { _trainingUnsub(); _trainingUnsub = null; } }
    library?.classList.add('hidden');
    if (training) training.style.display = 'block';
    if (tab === 'reaction')  _renderReactionPanel();
    if (tab === 'coord')     _renderCoordPanel();
  }
};

const _trainingPanelHTML = (title, color, accentCls, modeButtons, roundOptions, startColor) => `
  <div class="space-y-4">
    <h2 class="text-sm font-bold uppercase tracking-wider" style="color:${color}">${title}</h2>
    <div>
      <div class="text-xs text-[#6b7280] mb-2">Mode</div>
      <div class="flex gap-1">${modeButtons}</div>
    </div>
    <div>
      <div class="text-xs text-[#6b7280] mb-2">Rounds</div>
      <div class="flex gap-1">${roundOptions}</div>
    </div>
    <button id="btn-training-start" class="w-full py-2 rounded-xl font-bold text-sm text-black transition cursor-pointer" style="background:${startColor}">▶ Start</button>
    <div id="training-live" class="text-center py-1 min-h-[2rem] text-sm"></div>
    <div id="training-results" style="display:none" class="space-y-2 pt-3 border-t border-[rgba(255,255,255,0.08)]">
      <div class="flex justify-between text-xs"><span class="text-[#6b7280]">Avg Reaction</span><span id="tr-avg" class="font-bold text-[#e0e0e8]">—</span></div>
      <div class="flex justify-between text-xs"><span class="text-[#6b7280]">Best</span><span id="tr-best" class="font-bold text-[#10b981]">—</span></div>
      <div id="tr-angle-row" class="flex justify-between text-xs"><span class="text-[#6b7280]">Avg Angle Δ</span><span id="tr-angle" class="font-bold text-[#f59e0b]">—</span></div>
      <div class="flex justify-between text-xs"><span class="text-[#6b7280]">Accuracy</span><span id="tr-accuracy" class="font-bold">—</span></div>
      <div class="flex justify-between text-xs"><span class="text-[#6b7280]">Rank</span><span id="tr-rank" class="font-bold text-[#f59e0b]">—</span></div>
      <div id="tr-history" class="flex gap-0.5 flex-wrap pt-1"></div>
    </div>
  </div>`;

const _modeBtns = (modes, accentColor) => modes.map(([label, mode], i) =>
  `<button class="training-mode-btn flex-1 py-1.5 px-2 rounded-lg text-xs border cursor-pointer transition"
    style="${i === 0 ? `border-color:${accentColor};color:${accentColor}` : 'border-color:rgba(255,255,255,0.08);color:#6b7280'}"
    data-mode="${mode}">${label}</button>`
).join('');

const _roundBtns = (opts, defaultRounds, accentColor) => opts.map(r =>
  `<button class="rounds-btn flex-1 py-1 rounded-lg text-xs border cursor-pointer transition"
    style="${r === defaultRounds ? `border-color:${accentColor};color:${accentColor}` : 'border-color:rgba(255,255,255,0.08);color:#6b7280'}"
    data-rounds="${r}">${r}</button>`
).join('');

const _renderReactionPanel = () => {
  const panel = document.getElementById('training-panel');
  if (!panel) return;
  const color = '#06b6d4';
  panel.innerHTML = _trainingPanelHTML(
    'Reaction Test', color, color,
    _modeBtns([['Button', 'reaction_button'], ['Stick', 'reaction_stick']], color),
    _roundBtns([5, 10, 20], 10, color),
    color
  );
  document.getElementById('tr-angle-row')?.style.setProperty('display', 'none');
  _trainingMode   = 'reaction_button';
  _trainingRounds = 10;
  _wireTrainingPanel(color);
};

const _renderCoordPanel = () => {
  const panel = document.getElementById('training-panel');
  if (!panel) return;
  const color = '#10b981';
  panel.innerHTML = _trainingPanelHTML(
    'Coordination', color, color,
    _modeBtns([['Right Stick', 'coord_rs'], ['Left Stick', 'coord_ls']], color),
    _roundBtns([5, 10, 15], 10, color),
    color
  );
  _trainingMode   = 'coord_rs';
  _trainingRounds = 10;
  _wireTrainingPanel(color);
};

const _wireTrainingPanel = (accentColor) => {
  document.querySelectorAll('.training-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.training-mode-btn').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.08)';
        b.style.color = '#6b7280';
      });
      btn.style.borderColor = accentColor;
      btn.style.color = accentColor;
      _trainingMode = btn.dataset.mode;
    });
  });

  document.querySelectorAll('.rounds-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rounds-btn').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.08)';
        b.style.color = '#6b7280';
      });
      btn.style.borderColor = accentColor;
      btn.style.color = accentColor;
      _trainingRounds = parseInt(btn.dataset.rounds);
    });
  });

  document.getElementById('btn-training-start')?.addEventListener('click', () => {
    const startBtn = document.getElementById('btn-training-start');
    if (Training.isActive) {
      Training.stop();
      if (startBtn) { startBtn.textContent = '▶ Start'; startBtn.style.background = accentColor; }
      return;
    }
    if (startBtn) { startBtn.textContent = '■ Stop'; startBtn.style.background = '#ef4444'; }
    const live    = document.getElementById('training-live');
    const results = document.getElementById('training-results');
    if (live) live.textContent = '';
    if (results) results.style.display = 'none';

    if (_trainingUnsub) _trainingUnsub();
    _trainingUnsub = Training.onChange((e) => _onTrainingEvent(e, accentColor));
    Training.start(_trainingMode, _trainingRounds);
  });
};

const _onTrainingEvent = (e, accentColor) => {
  const live    = document.getElementById('training-live');
  const results = document.getElementById('training-results');
  const startBtn = document.getElementById('btn-training-start');

  if (e.type === 'waiting') {
    if (live) live.innerHTML = `<span style="color:#6b7280">Round ${e.round + 1} / ${e.total} — get ready…</span>`;
  } else if (e.type === 'stimulus') {
    const label = e.stimulus.kind === 'button'
      ? `Press <b>${e.stimulus.value}</b>`
      : `Flick <b>${e.stimulus.value.replace('_', '-')}</b>`;
    if (live) live.innerHTML = `<span style="color:${accentColor};font-size:1.1rem">${label}</span>`;
  } else if (e.type === 'result') {
    const r = e.result;
    const col = r.correct ? '#10b981' : '#ef4444';
    const rt  = r.timeout ? 'MISS' : `${r.rt}ms`;
    const ang = r.angleDiff !== undefined ? ` · ${r.angleDiff}°` : '';
    if (live) live.innerHTML = `<span style="color:${col};font-weight:700">${rt}${ang}</span>`;
  } else if (e.type === 'complete') {
    const stats = Training.calcStats(e.results);
    if (startBtn) { startBtn.textContent = '▶ Start'; startBtn.style.background = accentColor; }
    if (live) live.textContent = '';
    if (results) {
      results.style.display = 'block';
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('tr-avg',      stats.avg  ? `${stats.avg}ms`  : '—');
      set('tr-best',     stats.best ? `${stats.best}ms` : '—');
      set('tr-rank',     Training.rtRank(stats.avg));
      const accEl = document.getElementById('tr-accuracy');
      if (accEl) {
        accEl.textContent = `${stats.accuracy}%`;
        accEl.style.color = stats.accuracy >= 80 ? '#10b981' : stats.accuracy >= 60 ? '#f59e0b' : '#ef4444';
      }
      const angleRow = document.getElementById('tr-angle-row');
      if (stats.avgAngle !== null && angleRow) {
        angleRow.style.display = '';
        set('tr-angle', `${stats.avgAngle}°`);
      }
      const hist = document.getElementById('tr-history');
      if (hist) {
        hist.innerHTML = e.results.map(r => {
          const bg = r.correct ? (r.rt < 200 ? '#10b981' : r.rt < 300 ? '#f59e0b' : accentColor) : '#ef4444';
          const tip = r.correct ? `${r.rt}ms` : 'miss';
          return `<span title="${tip}" style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${bg}"></span>`;
        }).join('');
      }
    }
  } else if (e.type === 'stopped') {
    if (startBtn) { startBtn.textContent = '▶ Start'; startBtn.style.background = accentColor; }
    if (live) live.textContent = '';
  }
};

// ── Export for pad.html ──
export const PadApp = { init: _init };
