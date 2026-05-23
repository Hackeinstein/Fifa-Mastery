# DeepSeek Implementation Prompt — PS5 Pad Mastery

> Copy everything below this line and paste it as your prompt to DeepSeek (or any capable coder LLM).

---

## YOUR TASK

Implement the complete **PS5 Pad Mastery** web application — a PS5 DualSense controller training tool for EA Sports FC 25 skill moves. You have been provided with four reference documents:

- `ARCHITECTURE.md` — system design, data schemas, module breakdown, algorithms
- `TASKS.md` — 45 prioritized, granular implementation tasks
- `RULES.md` — mandatory coding standards and constraints
- `data/moves.json` — complete data source with 27 moves, 10 sequences, 5 drills

**Read all four documents before writing a single line of code.** The architecture is the spec.

---

## CONSTRAINTS (non-negotiable)

1. **Pure HTML + Tailwind CDN + Vanilla JavaScript.** No frameworks, no build tools, no npm.
2. **Two main HTML files:** `index.html` (landing) and `pad.html` (training interface).
3. **ES Modules** (`<script type="module">`). All JS files use `export`/`import`.
4. **No external JS dependencies** beyond Tailwind CDN.
5. **Fully offline-capable** — all data in `localStorage` + the provided `moves.json`.
6. **Must work with a physical PS5 DualSense** connected via USB (Gamepad API).

---

## WHAT TO BUILD

### File Structure to Create

```
ps5-pad-mastery/
├── index.html
├── pad.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── state.js
│   ├── data.js
│   ├── engine.js
│   ├── controller.js
│   ├── metronome.js
│   ├── input.js
│   ├── stats.js
│   └── ui.js
└── data/
    └── moves.json        ← ALREADY PROVIDED, do not modify
```

---

## VISUAL DESIGN SPEC

### Theme
```css
--bg-primary:   #0a0a14   /* page background */
--bg-secondary: #111120   /* panel backgrounds */
--bg-card:      #1a1a2e   /* card backgrounds */
--accent-blue:  #3b82f6   /* navigation, links */
--accent-cyan:  #06b6d4   /* active/pressed state, primary actions */
--accent-green: #10b981   /* perfect score, connected, mastered */
--accent-yellow:#f59e0b   /* good score, warning */
--accent-red:   #ef4444   /* miss, error, disconnected */
--text-primary: #e0e0e8
--text-muted:   #6b7280
--border-subtle: rgba(255,255,255,0.08)
```

### Layout — `pad.html` (Desktop)
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Logo | BPM Slider | ⚙ Settings | 📊 Stats         │
├──────────────┬──────────────────────────┬───────────────────┤
│ MOVE LIBRARY │   VIRTUAL CONTROLLER     │   STEP PANEL      │
│              │   (DualSense SVG)        │                   │
│ Search bar   │   Beat ring overlay      │   Current step    │
│ Star filter  │   Stick arrows           │   Step list       │
│ Category     │   Lightbar color         │   Progress bar    │
│ Move cards   │   Step number label      │   Score display   │
│              │                          │   Tips section    │
├──────────────┴──────────────────────────┴───────────────────┤
│  STATUS: 🎮 Connected | BPM: 90 | Score: 87 | Beat: ●○○○  │
└─────────────────────────────────────────────────────────────┘
```

Mobile: Library collapses to bottom drawer, controller stays centered top, step panel is a slide-up overlay.

---

## THE DUALSENSE SVG

Use this exact SVG in `pad.html`. It is the virtual controller visualization. Do not simplify or replace it.

**Key element IDs you will need:**
- Controller body: `#AG-OUTLINE`
- Lightbar: `#LIGHTBAR` (animate fill color)
- Buttons with `data-btn` attribute: `L1`, `R1`, `D-Up`, `D-Down`, `D-Left`, `D-Right`, `△`, `◯`, `✕`, `□`, `Create`, `Options`, `PS`, `Mute`
- Stick groups: `#LEFT_STICK`, `#RIGHT_STICK`
- Stick knobs (animate transform): `#LS_KNOB`, `#RS_KNOB`
- L2/R2 indicators: `#trigger-l2`, `#trigger-r2` (HTML divs, not SVG)

**SVG State CSS Classes** (add/remove these on SVG elements):
```css
.ctrl-idle     { /* default dim */ }
.ctrl-next     { /* upcoming step: pulsing blue glow */ animation: pulse-glow 600ms ease infinite; }
.ctrl-active   { stroke: #06b6d4 !important; fill: rgba(6,182,212,0.18) !important; filter: drop-shadow(0 0 12px #06b6d4); }
.ctrl-perfect  { /* green flash, 400ms */ animation: flash-perfect 400ms ease; }
.ctrl-good     { /* yellow flash */ animation: flash-good 400ms ease; }
.ctrl-ok       { /* orange flash */ animation: flash-ok 400ms ease; }
.ctrl-miss     { /* red flash */ animation: flash-miss 400ms ease; }
```

---

## MODULE IMPLEMENTATION DETAILS

### `state.js`
Implement a reactive pub/sub store:
```js
export const State = createStore({
  db: null,
  currentView: 'library',
  selectedMoveId: null,
  session: {
    isActive: false, isPaused: false,
    mode: 'guided', currentStepIdx: 0,
    totalSteps: 0, bpm: 90,
    results: [], startTime: null
  },
  controller: {
    isConnected: false, gamepadIndex: -1,
    activeButtons: new Set(),
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    l2Value: 0, r2Value: 0
  },
  metronome: { isRunning: false, bpm: 90, beat: 0 },
  user: null,
  moveStats: {},
  settings: { bpm: 90, volume: 0.5, showHints: true, strictMode: false }
});
```

The store must support:
- `State.get(key)` / `State.set(key, value)` / `State.update({partial})`
- `State.subscribe(key, fn)` → returns unsubscribe function
- `State.setPath('session.currentStepIdx', 2)` for dot-notation paths

### `data.js`
```js
export const Data = {
  async load() { /* fetch moves.json, cache, return db */ },
  getMove(id) { /* return move or undefined */ },
  getMoves(filter) { /* filter by stars/category/tags/search */ },
  getSequence(id) {},
  getDrill(id) {},
  searchMoves(query) { /* case-insensitive on name+description+tags */ }
};
```

### `input.js`
The most performance-critical module. Key requirements:

**Gamepad polling (requestAnimationFrame at 60fps):**
```js
// Standard DualSense button mapping:
const GAMEPAD_MAP = {
  0:'✕', 1:'◯', 2:'□', 3:'△',
  4:'L1', 5:'R1', 6:'L2', 7:'R2',
  8:'Create', 9:'Options', 10:'L3', 11:'R3',
  12:'D-Up', 13:'D-Down', 14:'D-Left', 15:'D-Right', 16:'PS'
};
// Axes: 0=LS-X, 1=LS-Y, 2=RS-X, 3=RS-Y
```

**Flick detection algorithm:**
```
Every frame:
  magnitude = sqrt(x² + y²)
  if magnitude > 0.7 AND prevMagnitude < 0.2:
    angle = atan2(y, x)
    direction = quantizeToOctant(angle)
    emit({ type:'flick', source:'RS'|'LS', direction, directionAngle:angle })
    set 200ms cooldown
```

**Octant quantization:**
```
angle (degrees from East, CCW):   direction
  -22.5 to  22.5                 → RIGHT
   22.5 to  67.5                 → DOWN_RIGHT
   67.5 to 112.5                 → DOWN
  112.5 to 157.5                 → DOWN_LEFT
  157.5 to 202.5 (or -180–-157)  → LEFT
  202.5 to 247.5                 → UP_LEFT
  247.5 to 292.5                 → UP
  292.5 to 337.5                 → UP_RIGHT
```

**Note:** In browser Gamepad API, Y axis is inverted (up = negative). Account for this.

**Hold detection:**
- After magnitude > 0.6 is sustained for 300ms: emit `hold_start`
- When magnitude returns below 0.2: emit `hold_end`

**Rotation detection:**
- Track directional sequence in a ring buffer (last 8 positions)
- CW: RIGHT → DOWN → LEFT → UP sequence (or any 180°+ arc)
- CCW: LEFT → DOWN → RIGHT → UP sequence

### `metronome.js`
Use the Web Audio API scheduler-ahead pattern (NOT setInterval for the actual clicks):
```js
const LOOKAHEAD = 25;       // ms (setInterval interval)
const SCHEDULE_WINDOW = 0.1; // seconds to schedule ahead

function scheduler() {
  while (nextBeatTime < audioCtx.currentTime + SCHEDULE_WINDOW) {
    scheduleClick(nextBeatTime);
    nextBeatTime += 60 / bpm;
  }
}
setInterval(scheduler, LOOKAHEAD);
```

Click sound: 1000Hz sine wave, 20ms duration, 0.3 gain. Use `AudioContext.createOscillator()`.

### `engine.js` — Practice Engine

**Core algorithm:**
```
start(moveId, { bpm, mode }):
  steps = Data.getMove(moveId).inputs
  State.update({ session: { isActive:true, totalSteps:steps.length, ... } })
  Metronome.start(bpm)
  Controller.resetAll()
  highlightStep(0)

onInput(inputEvent):
  if !session.isActive: return
  step = steps[currentStepIdx]
  if matchInput(event, step):
    timingDelta = performance.now() - stepStartTime - (step.beatValue * beatDuration)
    rating = rateTimingDelta(timingDelta)
    Controller.highlight(step.controller.svgTargets, rating, 400)
    recordResult(rating)
    advanceStep()

matchInput(event, step):
  if event.type !== step.type: return false
  if step.controller.stick && event.source !== step.controller.stick: return false
  if step.controller.direction:
    expectedAngle = directionToAngle(step.controller.direction)
    actualAngle = event.directionAngle
    diff = Math.abs(normalizeAngle(actualAngle - expectedAngle))
    if diff > step.tolerance * (Math.PI/180): return false
  for button of step.controller.buttons:
    if !State.get('controller').activeButtons.has(button): return false
  return true

rateTimingDelta(delta):
  abs = Math.abs(delta)
  if abs < 50:  return { rating:'perfect', score:100 }
  if abs < 150: return { rating:'good',    score:75 }
  if abs < 350: return { rating:'ok',      score:50 }
  return        { rating:'late',           score:25 }
```

**Timing window constants** (tunable via settings in future):
- PERFECT_WINDOW = 50ms
- GOOD_WINDOW = 150ms
- OK_WINDOW = 350ms
- STEP_TIMEOUT_MULTIPLIER = 2.0 × beatDuration (auto-miss if no input)

**Score calculation at session end:**
```
score = average of all step scores
accuracy = (non-miss steps / total steps) × 100
```

### `controller.js`
**The SVG highlighter.** Must handle all visual feedback.

```js
export const Controller = {
  init(svgEl) {
    // Cache all data-btn elements
    // Create 8 directional arrow SVG elements per stick
    // Create beat ring overlay element
  },
  
  highlight(svgTargets, state, durationMs) {
    // Remove all ctrl-* classes from targets
    // Add ctrl-${state} class
    // After durationMs: revert to ctrl-idle
  },
  
  showStickArrow(side, direction) {
    // Show one of 8 pre-created arrows, hide others
    // side: 'LS' or 'RS', direction: 'UP'|'DOWN' etc
  },
  
  animateStickTo(side, direction, intensity) {
    const SCALE = 8; // px
    const vector = directionToVector(direction);
    const knob = side === 'LS' ? lsKnob : rsKnob;
    knob.style.transform = `translate(${vector.x * SCALE * intensity}px, ${vector.y * SCALE * intensity}px)`;
  },
  
  pulseBeat() {
    // Trigger CSS keyframe on beat ring overlay
  },
  
  setLightbar(color) {
    lightbarEl.setAttribute('fill', color);
  },
  
  resetAll() {
    // Remove all ctrl-* from all elements
    // Reset knobs to center
    // Reset arrows
  }
};
```

### `stats.js`
All localStorage keys prefixed with `pspm_`.

```js
export const Stats = {
  loadAll() { /* parse all pspm_* keys, return defaults if missing */ },
  recordSession(data) {
    // Update pspm_move_stats for moveId
    // Append to pspm_sessions (cap at 100, FIFO eviction)
    // Recalculate masteryLevel based on history
  },
  updateXP(amount) {
    // Add XP, check level thresholds: [0,100,250,500,1000,2000,...]
    // Return { newXP, leveledUp, newLevel }
  },
  getMoveStats(moveId) { /* return MoveStats or default empty */ },
  getMasteryLevel(moveId) {
    // 0 = new (0 sessions)
    // 1 = learning (1–2 sessions)
    // 2 = practiced (3+ sessions, avgScore >= 70)
    // 3 = mastered (10+ sessions, avgScore >= 85)
  }
};
```

### `ui.js`
Keep render functions pure — they take data and return HTML strings or DOM nodes, then mount them. No business logic in `ui.js`.

**Required render functions:**
```js
UI.renderMoveCard(move, stats)     // → HTML string for library card
UI.renderMoveDetail(move, stats)   // → populate detail panel
UI.updateStepPanel(step, idx, total) // → update practice step display
UI.showScoreOverlay(score, accuracy, results) // → animate score modal
UI.renderStats(allStats)           // → populate stats dashboard
UI.renderLibrary(moves, filter)    // → populate library panel
UI.toast(msg, type, duration)      // → slide-in notification
UI.setConnectionStatus(connected, name) // → update status badge
```

---

## CSS ANIMATIONS (implement in `styles.css`)

```css
@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 4px #3b82f6); }
  50%       { filter: drop-shadow(0 0 16px #60a5fa); }
}

@keyframes flash-perfect {
  0%   { stroke: #10b981; fill: rgba(16,185,129,0.3); filter: drop-shadow(0 0 20px #10b981); }
  100% { stroke: rgba(255,255,255,0.1); fill: none; filter: none; }
}

@keyframes flash-miss {
  0%   { stroke: #ef4444; fill: rgba(239,68,68,0.25); filter: drop-shadow(0 0 16px #ef4444); }
  100% { stroke: rgba(255,255,255,0.1); fill: none; filter: none; }
}

@keyframes beat-pulse {
  0%   { transform: scale(1);    opacity: 0.4; }
  30%  { transform: scale(1.04); opacity: 0.9; }
  100% { transform: scale(1);    opacity: 0.4; }
}

@keyframes tag-in {
  from { transform: scale(0.7); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

---

## `index.html` LANDING PAGE REQUIREMENTS

- Dark hero: full-viewport, centered, animated DualSense SVG doing button highlights in a loop
- Headline: **"Master Every Skill Move"**
- Subheadline: "BPM-guided training for EA Sports FC 25 · PS5 DualSense"
- Stats row: load `moves.json` and display live count: "**27 Moves** · **10 Sequences** · **5 Drills**"
- Feature grid (6 cards, 2-column): Virtual Controller / BPM Training / Progress Tracking / Skill Library / Offline Play / Move Sequences
- CTA button: "**Start Training →**" (links to `pad.html`)
- Footer: version number + "No account required · Works offline"

---

## `pad.html` HEADER REQUIREMENTS

- Logo left: "🎮 PS5 Pad Mastery" (no actual emoji if RULES.md says no emoji — text only)
- Center: BPM control (slider 40–200, +/- buttons, tap tempo button, number display)
- Right: gear icon → settings panel, chart icon → stats panel
- Sub-header row: controller status dot, BPM display, current score, beat counter (4 dots)

---

## IMPORTANT IMPLEMENTATION NOTES

### Gamepad API Quirks
1. `navigator.getGamepads()` must be called inside `requestAnimationFrame` — it returns a snapshot, not a live object
2. Gamepads are NOT accessible until after the first button press (browser security requirement) — show "Press any button to activate" message
3. DualSense Y-axis is inverted: negative Y = stick pushed UP
4. L2/R2 are both digital buttons (index 6/7) AND have analog `.value` (0–1). Use `.pressed` for digital, `.value` for analog trigger visualization
5. Some browsers report DualSense axes differently via USB vs Bluetooth — handle both: axes[0–3] for sticks first, fall back to axes[2–5]

### Web Audio API Quirks
1. `AudioContext` cannot be created before user interaction (browser policy) — create it on first user click/keypress
2. Always call `audioCtx.resume()` before scheduling — context starts in `suspended` state
3. Metronome clicks must be scheduled using `audioCtx.currentTime`, NOT `performance.now()`

### ES Module Loading in pad.html
```html
<script type="module">
  import { State } from './js/state.js';
  import { Data } from './js/data.js';
  // ... other imports
  import { PadApp } from './js/app.js';
  PadApp.init();
</script>
```

### Direction to Angle Mapping
```js
// atan2 convention: 0=East, positive=CCW, range [-π, π]
// Browser Y-axis: positive Y = DOWN (invert for intuitive UP)
const DIRECTION_ANGLES = {
  RIGHT:      0,
  UP_RIGHT:  -Math.PI * 0.25,   // -45°
  UP:        -Math.PI * 0.5,    // -90°
  UP_LEFT:   -Math.PI * 0.75,   // -135°
  LEFT:       Math.PI,          // 180° or -180°
  DOWN_LEFT:  Math.PI * 0.75,   // 135°
  DOWN:       Math.PI * 0.5,    // 90°
  DOWN_RIGHT: Math.PI * 0.25    // 45°
};

// Quantize angle to nearest octant direction:
function angleToDirection(angle) {
  const normalized = ((angle + Math.PI) / (2 * Math.PI)) * 8;
  const index = Math.round(normalized) % 8;
  return ['LEFT','DOWN_LEFT','DOWN','DOWN_RIGHT','RIGHT','UP_RIGHT','UP','UP_LEFT'][index];
}
```

---

## IMPLEMENTATION ORDER

Follow this order to avoid dependency issues:

1. `state.js` (no dependencies)
2. `data.js` (depends on State)
3. `styles.css` + SVG embed in `pad.html`
4. `controller.js` (depends on State, SVG)
5. `input.js` (depends on State, Controller)
6. `metronome.js` (depends on State, Web Audio)
7. `engine.js` (depends on State, Data, Controller, Input, Metronome)
8. `stats.js` (depends on State)
9. `ui.js` (depends on State, Data, Stats)
10. `app.js` (imports and wires everything)
11. `pad.html` full layout
12. `index.html`

---

## DELIVERABLES

Provide the complete implementation of every file listed in the structure above. Each file should be complete and functional — no `// TODO` stubs. The application must:

- [ ] Load `moves.json` and display 27 moves in the library
- [ ] Accept gamepad input from a physical DualSense via USB
- [ ] Run guided practice sessions with BPM metronome
- [ ] Highlight the correct SVG element for each move step
- [ ] Score each step (PERFECT/GOOD/OK/MISS) with timing accuracy
- [ ] Display session score overlay after completion
- [ ] Persist progress to localStorage across page reloads
- [ ] Work in keyboard fallback mode when no gamepad is connected
- [ ] Be fully responsive on mobile viewports
- [ ] Run directly in a browser without any build step
