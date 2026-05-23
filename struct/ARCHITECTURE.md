# PS5 Pad Mastery — Architecture Document

> Version 1.0 | Stack: Pure HTML · Tailwind CDN · Vanilla JS · localStorage

---

## 1. Project Overview

**PS5 Pad Mastery** is a browser-based training tool that teaches EA Sports FC 25 skill moves using a PS5 DualSense controller. It runs fully offline, requires no backend, and persists all user data in localStorage. The core loop is: *browse a move → watch the input sequence visualized on a virtual controller → practice with BPM guidance → receive a score → track progress over time.*

---

## 2. Folder Structure

```
ps5-pad-mastery/
│
├── index.html            # Landing page: hero, feature overview, navigation hub
├── pad.html              # Main training interface (90% of app logic lives here)
│
├── data/
│   └── moves.json        # Single source of truth for all moves, sequences, drills
│
├── css/
│   └── styles.css        # Only what Tailwind cannot express: SVG animations,
│                         # custom keyframes, CSS custom properties for theming
│
├── js/
│   ├── app.js            # Bootstrap: init sequence, page routing, global error handler
│   ├── state.js          # Reactive pub/sub store (single source of truth for runtime state)
│   ├── data.js           # Data loading, parsing, querying moves.json
│   ├── engine.js         # Practice Engine: step sequencer, input matching, scoring
│   ├── controller.js     # Virtual DualSense SVG: highlight, animate, reset
│   ├── metronome.js      # Web Audio API BPM clock, beat events
│   ├── input.js          # Gamepad API polling, input normalization, event emission
│   ├── stats.js          # localStorage read/write, session recording, aggregation
│   └── ui.js             # DOM render helpers: move cards, modals, score overlays
│
└── assets/
    └── sounds/           # Optional: tick.wav, perfect.wav, miss.wav (base64 embedded)
```

### Justification

| File | Reason for Separation |
|------|----------------------|
| `index.html` | Keeps landing UI isolated; pad.html can be bookmarked directly |
| `pad.html` | All practice logic in one HTML file — no SPA router needed |
| `data/moves.json` | Decoupled data source; can be updated without touching JS |
| `state.js` | Prevents prop-drilling chaos in vanilla JS; all modules subscribe to the same store |
| `engine.js` | The most complex module; isolated so it can be unit-tested independently |
| `controller.js` | SVG mutation is verbose — isolating it keeps engine.js clean |
| `metronome.js` | Web Audio API requires its own lifecycle management |
| `input.js` | Gamepad polling is a tight loop; decoupled so engine doesn't know about hardware |

---

## 3. Data Architecture

### 3.1 Type Definitions (JSDoc / Pseudo-TypeScript)

```
Direction  = "UP" | "DOWN" | "LEFT" | "RIGHT"
           | "UP_LEFT" | "UP_RIGHT" | "DOWN_LEFT" | "DOWN_RIGHT"

InputType  = "flick"        // Quick stick movement, returns to neutral
           | "hold"         // Sustained stick/button position (duration matters)
           | "press"        // Momentary button press (face buttons, bumpers)
           | "rotate_cw"    // Full or partial clockwise stick rotation
           | "rotate_ccw"   // Counter-clockwise rotation

Difficulty = "beginner" | "intermediate" | "advanced" | "expert"

Category   = "feint" | "stepover" | "ball_roll" | "roulette" | "elastico"
           | "rainbow" | "la_croqueta" | "combo" | "fake" | "chop"

ControllerTarget = "L1" | "R1" | "trigger-l2" | "trigger-r2"
                 | "LEFT_STICK" | "RIGHT_STICK"
                 | "TRIANGLE" | "CIRCLE" | "CROSS" | "SQUARE"
                 | "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT"
                 | "PS" | "CREATE" | "OPTIONS" | "MUTE"

InputStep {
  id:          string          // Unique within move, e.g. "s1"
  step:        number          // 1-based display index
  type:        InputType
  controller: {
    stick?:    "LS" | "RS"     // Which stick to move (if any)
    direction?: Direction      // Target direction (for flick/hold/rotate start)
    buttons:   string[]        // Buttons to hold during this step, e.g. ["L2"]
    svgTargets: ControllerTarget[]  // SVG elements to highlight
  }
  beatValue:   number          // Duration in beats (1.0 = one beat at current BPM)
  holdBeats?:  number          // For "hold" type: how long to sustain (in beats)
  label:       string          // Human-readable description shown in step panel
  tolerance:   number          // Directional tolerance in degrees (default: 45)
}

Move {
  id:          string
  name:        string
  stars:       1 | 2 | 3 | 4 | 5
  category:    Category
  difficulty:  Difficulty
  tags:        string[]
  description: string
  tips:        string[]        // Max 4 coaching tips
  videoUrl:    string          // Empty string if none
  inputs:      InputStep[]
  unlockLevel: number          // Minimum user level to attempt (0 = always available)
}

SequenceMove {
  moveId:      string          // References Move.id
  timingNote:  string          // Coaching note for transition
  gapBeats:   number           // Pause beats between this and next move (default: 0)
}

Sequence {
  id:          string
  name:        string
  description: string
  difficulty:  Difficulty
  tags:        string[]
  moves:       SequenceMove[]
}

DrillGoals {
  accuracy:    number          // Target accuracy percentage (0–100)
  streak:      number          // Target consecutive perfect inputs
}

Drill {
  id:          string
  name:        string
  description: string
  moves:       string[]        // Array of Move IDs (repetitions built in)
  repetitions: number
  bpm:         number          // Recommended BPM for this drill
  goals:       DrillGoals
}

MovesDatabase {
  version:     string
  lastUpdated: string          // ISO date string
  moves:       Move[]
  sequences:   Sequence[]
  drills:      Drill[]
}
```

### 3.2 LocalStorage Schema

```
Key                           Type        Description
──────────────────────────────────────────────────────────────────
pspm_user_profile             Object      { name, createdAt, level, xp }
pspm_move_stats               Object      { [moveId]: MoveStats }
pspm_sessions                 Array       Last 100 sessions (FIFO)
pspm_settings                 Object      { bpm, volume, theme, showHints }
pspm_unlocked_moves           Array       Array of unlocked move IDs
pspm_drill_progress           Object      { [drillId]: DrillProgress }
```

```
MoveStats {
  moveId:        string
  attempts:      number
  bestScore:     number        // 0–100
  avgScore:      number
  totalPerfects: number
  lastPracticed: string        // ISO timestamp
  masteryLevel:  0 | 1 | 2 | 3  // 0=new, 1=learning, 2=practiced, 3=mastered
}

Session {
  id:            string        // UUID
  timestamp:     string
  moveId:        string
  bpm:           number
  score:         number
  accuracy:      number        // percentage
  stepResults:   StepResult[]
  duration:      number        // ms
}

StepResult {
  stepId:        string
  expected:      InputType
  got:           InputType | null
  timingDelta:   number        // ms (positive = late, negative = early)
  rating:        "perfect" | "good" | "ok" | "miss"
  score:         number
}
```

---

## 4. Module Breakdown & Responsibilities

### 4.1 `state.js` — Reactive Store

The single source of truth for all runtime state. Uses a minimal pub/sub pattern. No frameworks.

```
State shape: {
  // Data
  db: MovesDatabase | null          // Loaded from moves.json

  // Navigation
  currentView: "library" | "practice" | "stats" | "settings"
  selectedMoveId: string | null
  selectedSequenceId: string | null
  selectedDrillId: string | null

  // Practice session
  session: {
    isActive: boolean
    isPaused: boolean
    mode: "freeplay" | "guided" | "drill"
    currentStepIdx: number
    totalSteps: number
    bpm: number
    results: StepResult[]
    startTime: number | null
  }

  // Controller
  controller: {
    isConnected: boolean
    gamepadIndex: number
    activeButtons: Set<string>
    leftStick: { x: number, y: number }
    rightStick: { x: number, y: number }
    l2Value: number
    r2Value: number
  }

  // Metronome
  metronome: {
    isRunning: boolean
    bpm: number
    beat: number              // Current beat counter
  }

  // User
  user: UserProfile | null
  moveStats: { [moveId]: MoveStats }
  settings: Settings
}
```

**Interface:**
- `State.get(key)` — read a top-level key
- `State.set(key, value)` — write and notify subscribers
- `State.update(partialObject)` — merge partial update
- `State.subscribe(key, fn)` — returns unsubscribe function
- `State.subscribeDeep(path, fn)` — dot-notation deep path subscription

### 4.2 `data.js` — Data Layer

**Responsibilities:**
- Fetch and cache `moves.json`
- Expose query API for the rest of the app
- Validate data schema on load (warn on missing required fields)

**Interface:**
- `Data.load()` → Promise\<MovesDatabase\>
- `Data.getMove(id)` → Move | undefined
- `Data.getMoves(filter?)` → Move[] (supports filtering by stars, category, tags)
- `Data.getSequence(id)` → Sequence | undefined
- `Data.getDrill(id)` → Drill | undefined
- `Data.searchMoves(query)` → Move[]

### 4.3 `input.js` — Input Normalizer

**Responsibilities:**
- Poll Gamepad API at 60fps (requestAnimationFrame)
- Detect button presses, releases, and analog values
- Detect stick **flick** events (rapid movement + return to neutral)
- Detect stick **hold** events (sustained directional position)
- Detect stick **rotation** patterns (CW/CCW)
- Normalize all events to a common `InputEvent` format
- Emit events via State updates and custom DOM events

**InputEvent format:**
```js
{
  type:      "button_press" | "button_release" | "flick" | "hold_start"
           | "hold_end" | "rotate_cw" | "rotate_ccw" | "axis_change",
  source:    "LS" | "RS" | "BUTTON",
  button:    string | null,       // For button events
  direction: Direction | null,    // For stick events
  value:     number,              // Analog value 0–1
  timestamp: DOMHighResTimeStamp
}
```

**Flick detection algorithm:**
```
For each frame:
  1. Sample RS/LS axis values (x, y)
  2. Compute magnitude: sqrt(x² + y²)
  3. If magnitude > FLICK_THRESHOLD (0.7) AND previous magnitude < NEUTRAL_THRESHOLD (0.2):
     a. Compute angle: atan2(y, x)
     b. Quantize to 8 directions
     c. Emit { type: "flick", direction, timestamp }
     d. Start flick cooldown (prevent double-fire, 200ms)
  4. Track sustained position for hold detection
  5. Track sequential direction history for rotation detection
```

### 4.4 `engine.js` — Practice Engine

**Responsibilities:** The core of the app. Manages practice session lifecycle, step sequencing, timing evaluation, and scoring.

*(See Section 6 for detailed algorithm.)*

**Interface:**
- `Engine.start(moveId, options)` — begin a guided session
- `Engine.startFreeplay(moveId)` — no timing pressure mode
- `Engine.startDrill(drillId)` — run a drill sequence
- `Engine.pause()` / `Engine.resume()`
- `Engine.stop()` — end session, persist stats
- `Engine.onInput(inputEvent)` — called by input.js every frame

### 4.5 `controller.js` — Virtual Controller

**Responsibilities:**
- All read/write operations on the DualSense SVG DOM elements
- Highlight buttons in different states (idle, next, active, perfect, miss)
- Animate stick knobs to show direction cues
- Show directional arrows around stick rings for guided mode
- Manage highlight state queue for smooth transitions

**States per element:**
```
idle      → default dim appearance
next      → pulsing blue glow (upcoming step preview)
active    → cyan lit (step is now / held)
perfect   → green flash (correct timing)
good      → yellow flash
miss      → red flash
hold      → sustained cyan with intensity based on hold duration
```

**Interface:**
- `Controller.init(svgElement)` — attach to SVG
- `Controller.highlight(targets, state, duration?)` — set state on SVG elements
- `Controller.showStickArrow(side, direction)` — show directional arrow cue
- `Controller.hideStickArrow(side)` — remove arrow cue
- `Controller.animateStickTo(side, direction, intensity)` — move knob toward direction
- `Controller.resetAll()` — return everything to idle
- `Controller.markButtonPressed(token)` / `markButtonReleased(token)` — physical input mirror

### 4.6 `metronome.js` — BPM Clock

**Responsibilities:**
- Precise musical timing using Web Audio API (not setInterval, which drifts)
- Emit "beat" events that the engine subscribes to
- Visual beat indicator sync
- Sub-division support (8th notes, 16th notes)

**Algorithm (scheduler-ahead pattern):**
```
LOOKAHEAD = 25ms      // schedule this far ahead
SCHEDULE_WINDOW = 0.1  // AudioContext seconds

Every 25ms (setInterval):
  while nextBeatTime < audioContext.currentTime + SCHEDULE_WINDOW:
    scheduleClick(nextBeatTime, beatNumber)
    nextBeatTime += beatDuration
    beatNumber++
```

### 4.7 `stats.js` — Progress Tracker

**Responsibilities:**
- Read/write all localStorage data
- Aggregate session data into MoveStats
- Calculate mastery level (0–3) based on performance history
- XP calculation and level system

**XP Formula:**
```
sessionXP = baseXP × accuracyMultiplier × bpmMultiplier × streakBonus
  where:
    baseXP = 10 per move attempt
    accuracyMultiplier = accuracy / 100
    bpmMultiplier = 1 + (bpm - 60) / 200   (capped at 2.0)
    streakBonus = 1 + (consecutivePerfects * 0.1)
```

### 4.8 `ui.js` — UI Renderer

**Responsibilities:**
- Render move library cards
- Render move detail panel (inputs list, tips, video link)
- Render step-by-step practice panel
- Render score overlay after session
- Render stats dashboard
- Toast notifications
- Modal management

---

## 5. State Management Pattern

```js
// state.js — minimal reactive store, ~60 lines

const createStore = (initial) => {
  const listeners = new Map();
  let _state = structuredClone(initial);

  const notify = (key) => {
    listeners.get(key)?.forEach(fn => fn(_state[key], _state));
    listeners.get('*')?.forEach(fn => fn(_state));
  };

  return {
    get:    (key)    => _state[key],
    getAll: ()       => structuredClone(_state),

    set: (key, val) => {
      _state[key] = val;
      notify(key);
    },

    update: (partial) => {
      Object.assign(_state, partial);
      Object.keys(partial).forEach(notify);
    },

    // Dot-path: "session.currentStepIdx"
    setPath: (path, val) => {
      const keys = path.split('.');
      let ref = _state;
      for (let i = 0; i < keys.length - 1; i++) ref = ref[keys[i]];
      ref[keys.at(-1)] = val;
      notify(keys[0]);
    },

    // Returns unsubscribe fn
    subscribe: (key, fn) => {
      if (!listeners.has(key)) listeners.set(key, []);
      const fns = listeners.get(key);
      fns.push(fn);
      return () => fns.splice(fns.indexOf(fn), 1);
    }
  };
};

export const State = createStore(INITIAL_STATE);
```

**Data flow rule:** Only `engine.js`, `input.js`, and `stats.js` write to State. `ui.js` and `controller.js` only read and subscribe. This creates a unidirectional data flow without a framework.

---

## 6. Practice Engine — Detailed Algorithm

### 6.1 Session Lifecycle

```
START(moveId, options):
  1. Load move from Data.getMove(moveId)
  2. Flatten move.inputs into ordered steps array
  3. Set State.session = { isActive: true, currentStepIdx: 0, ... }
  4. Metronome.start(options.bpm)
  5. Controller.resetAll()
  6. highlightStep(0)        ← show first step as "next"
  7. Begin listening: input.js emits to Engine.onInput()

highlightStep(idx):
  1. Controller.highlight(steps[idx-1].svgTargets, "idle")   ← clear previous
  2. Controller.highlight(steps[idx].svgTargets, "next")     ← cue upcoming
  3. Controller.showStickArrow(stick, direction) if applicable
  4. Update UI step panel with step label
  5. Record stepStartTime = performance.now()
  6. Start step timeout timer (beatValue * beatDuration * 1.5)

onInput(inputEvent):
  1. If !session.isActive OR session.isPaused: ignore
  2. expectedStep = steps[session.currentStepIdx]
  3. doesMatch = matchInput(inputEvent, expectedStep)
  4. timingDelta = performance.now() - stepStartTime - expectedBeatTime
  5. rating = rateTimingDelta(timingDelta)
  6. If doesMatch:
     a. Controller.highlight(expected.svgTargets, ratingToState(rating), 400)
     b. Record StepResult { rating, timingDelta, score: ratingToScore(rating) }
     c. advanceStep()
  7. Else if inputEvent is a wrong input:
     a. Controller.highlight(wrongTargets, "miss", 300)
     b. Record miss (if strict mode enabled)

advanceStep():
  1. Increment currentStepIdx
  2. If currentStepIdx >= steps.length: completeSession()
  3. Else: highlightStep(currentStepIdx)

completeSession():
  1. Metronome.stop()
  2. Calculate session score (average of step scores)
  3. Calculate accuracy (% of non-miss steps)
  4. Stats.recordSession(sessionData)
  5. Controller.resetAll()
  6. UI.showScoreOverlay(score, accuracy, stepResults)
  7. State.setPath('session.isActive', false)
```

### 6.2 Input Matching (`matchInput`)

```
matchInput(event, step):
  // Type check
  if event.type !== step.type: return false

  // Stick check
  if step.controller.stick:
    if event.source !== step.controller.stick: return false

  // Direction check (with angular tolerance)
  if step.controller.direction:
    expectedAngle = directionToAngle(step.controller.direction)
    actualAngle = event.directionAngle
    angularDiff = abs(normalizeAngle(actualAngle - expectedAngle))
    if angularDiff > step.tolerance: return false

  // Held buttons check
  for button in step.controller.buttons:
    if !State.get('controller').activeButtons.has(button): return false

  return true
```

### 6.3 Timing Rating Windows

```
|timingDelta| < 50ms   → PERFECT  (100 pts, green flash)
|timingDelta| < 150ms  → GOOD     (75 pts,  yellow flash)
|timingDelta| < 350ms  → OK       (50 pts,  orange flash)
|timingDelta| ≥ 350ms  → LATE/EARLY (25 pts, dim flash)
timeout (no input)     → MISS     (0 pts,   red flash)
```

---

## 7. Event Flow — Full Practice Session

```
User selects move in Library
         │
         ▼
UI.renderMoveDetail(move)
  └─ Controller.previewMove(move)    ← auto-play inputs as animation loop
         │
User clicks "Practice"
         │
         ▼
Engine.start(moveId, { bpm, mode })
  ├─ State.update({ session: {...} })
  ├─ Metronome.start(bpm)
  │    └─ schedules Web Audio beats ahead of time
  ├─ Controller.resetAll()
  └─ highlightStep(0)
       └─ Controller.highlight(step0.svgTargets, "next")
       └─ UI.updateStepPanel(step0)
         │
         │  ← Metronome fires "beat" event
         │
Metronome emits "beat"
  └─ Engine.onBeat(beatNumber)
       └─ Updates visual beat indicator
       └─ Advances step timeout countdown
         │
         │  ← User presses RS Right (flick detected)
         │
input.js detects flick → emits InputEvent
  └─ Engine.onInput(event)
       ├─ matchInput() → true
       ├─ rateTimingDelta() → "PERFECT"
       ├─ Controller.highlight(targets, "perfect", 400)
       ├─ UI.showStepFeedback("PERFECT", 100pts)
       ├─ Stats.recordStep(stepResult)
       └─ advanceStep()
            └─ Controller.highlight(step1.svgTargets, "next")
            └─ UI.updateStepPanel(step1)
         │
       [steps repeat...]
         │
Final step completed
  └─ Engine.completeSession()
       ├─ Stats.recordSession(sessionData)
       ├─ Stats.updateMoveStats(moveId, score)
       ├─ Stats.updateXP(xpGained)
       ├─ Controller.resetAll()
       └─ UI.showScoreOverlay(score, breakdown)
            └─ "Practice Again" → Engine.start(same)
            └─ "Next Move" → UI.showLibrary()
            └─ "View Stats" → UI.renderStats()
```

---

## 8. Virtual Controller — SVG Architecture

The DualSense SVG from `test.html` is reused as the base. Additional overlay elements are injected on top:

```
SVG layers (bottom to top):
  1. #AG-OUTLINE      — controller body silhouette (static)
  2. #LIGHTBAR        — animates color on session state changes
  3. [button groups]  — all data-btn elements from original SVG
  4. .stick-directions — 8 directional arrow overlays per stick (injected)
  5. .beat-ring       — pulsing ring around controller on each metronome beat
  6. .step-number     — floating label showing "STEP 1 / 4" near active element
```

**CSS class states applied by `controller.js`:**

```css
/* These are added/removed programmatically — not static styles */
.ctrl-idle    { /* default: dim stroke */ }
.ctrl-next    { /* pulse animation: blue glow */ }
.ctrl-active  { /* solid cyan fill + glow */ }
.ctrl-perfect { /* green flash, 400ms animation */ }
.ctrl-good    { /* yellow flash */ }
.ctrl-ok      { /* orange flash */ }
.ctrl-miss    { /* red flash */ }
.ctrl-hold    { /* sustained cyan, intensity prop via --hold-intensity CSS var */ }
```

---

## 9. Page Architecture

### `index.html` — Landing Hub
- Hero with animated controller SVG preview
- Feature grid (6 feature cards)
- Move count badge (loaded from moves.json)
- Navigation links: Practice, Move Library, Stats
- No JS engine — pure CSS animations

### `pad.html` — Training Interface
Layout (3-panel on desktop, stacked on mobile):

```
┌────────────────────────────────────────────────────────────┐
│  HEADER: Logo | BPM control | Settings | Stats link        │
├─────────────────┬──────────────────────┬───────────────────┤
│  MOVE LIBRARY   │  VIRTUAL CONTROLLER  │  STEP PANEL       │
│  ─────────────  │  ──────────────────  │  ────────────────  │
│  Search/filter  │  DualSense SVG       │  Current step     │
│  Move cards     │  Beat ring           │  Step list        │
│  Star filter    │  Stick arrows        │  Progress bar     │
│  Category tabs  │  Lightbar color      │  Score display    │
│                 │                      │  Coaching tips    │
├─────────────────┴──────────────────────┴───────────────────┤
│  STATUS BAR: Controller • BPM: 90 • Score • Beat counter   │
└────────────────────────────────────────────────────────────┘
```

Mobile: Move Library collapses to bottom sheet, controller stays centered, step panel slides up as overlay.

---

## 10. Performance Constraints

- Gamepad polling: `requestAnimationFrame` (≈16ms / 60fps) — no `setInterval` for input
- Metronome: Web Audio scheduler (no drift)
- DOM mutations: batched via `requestAnimationFrame` — no mid-frame layout thrash
- localStorage writes: debounced 500ms after session activity
- moves.json: fetched once, cached in `Data._cache`, never re-fetched
- SVG highlights: CSS class toggles only (no inline style mutation per frame)
- Max session history in localStorage: 100 entries (FIFO eviction)
