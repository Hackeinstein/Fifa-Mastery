# PS5 Pad Mastery — Task List

> Priority levels: P0 (blocking) → P1 (core) → P2 (important) → P3 (polish)
> Each task is self-contained and independently implementable.

---

## PHASE 0 — Project Scaffolding

### T-001 · P0 · Create project skeleton
- Create `index.html`, `pad.html` with correct `<head>` (Tailwind CDN, meta viewport, title)
- Create `css/styles.css` with CSS custom properties (color palette, animation keyframes)
- Create `js/` folder with empty module files: `app.js`, `state.js`, `data.js`, `engine.js`, `controller.js`, `metronome.js`, `input.js`, `stats.js`, `ui.js`
- Create `data/moves.json` with empty shell `{ "version": "1.0.0", "moves": [], "sequences": [], "drills": [] }`

### T-002 · P0 · Define global CSS custom properties
In `styles.css`, define:
```css
:root {
  --bg-primary: #0a0a14;
  --bg-secondary: #111120;
  --bg-card: #1a1a2e;
  --accent-blue: #3b82f6;
  --accent-cyan: #06b6d4;
  --accent-green: #10b981;
  --accent-yellow: #f59e0b;
  --accent-red: #ef4444;
  --text-primary: #e0e0e8;
  --text-muted: #6b7280;
  --border-subtle: rgba(255,255,255,0.08);
}
```
Define keyframe animations: `@keyframes pulse-glow`, `@keyframes flash-perfect`, `@keyframes flash-miss`, `@keyframes beat-pulse`, `@keyframes tag-in`

### T-003 · P0 · Build state.js reactive store
- Implement `createStore(initialState)` function as specified in ARCHITECTURE.md §5
- Export `State` singleton initialized with `INITIAL_STATE`
- Ensure `subscribe` returns an unsubscribe function
- Add `setPath` for dot-notation deep updates
- No external dependencies

### T-004 · P0 · Create moves.json with full dataset
- Add all 25+ moves with complete schema (see ARCHITECTURE.md §3 and moves.json file)
- Add 8–10 sequences
- Add 5 drills
- Validate: every move has required fields (id, name, stars, inputs array with ≥1 step)

---

## PHASE 1 — Data Layer

### T-005 · P0 · Implement data.js loader
- `Data.load()`: fetch `data/moves.json`, cache result, handle network error (show fallback message)
- `Data.getMove(id)`: return move by id or undefined
- `Data.getMoves(filter)`: filter by `{ stars, category, difficulty, tags, search }`
- `Data.getSequence(id)`: return sequence by id
- `Data.getDrill(id)`: return drill by id
- `Data.searchMoves(query)`: case-insensitive search on name, description, tags
- On load, validate schema and `console.warn` for any missing required fields

### T-006 · P1 · Implement stats.js localStorage layer
- `Stats.loadAll()`: read all pspm_* keys from localStorage, parse JSON safely
- `Stats.saveMoveStats(moveId, sessionResult)`: update MoveStats aggregate
- `Stats.saveSession(sessionData)`: push to sessions array, enforce 100-entry FIFO limit
- `Stats.getMoveStats(moveId)`: return MoveStats or default empty stats
- `Stats.getRecentSessions(n)`: return last n sessions
- `Stats.getUserProfile()`: return profile or create default
- `Stats.updateXP(amount)`: add XP, check for level up, return `{ newXP, leveledUp, newLevel }`
- `Stats.getMasteredMoveIds()`: return array of move ids where masteryLevel === 3
- All localStorage writes are wrapped in try/catch (quota exceeded handling)

### T-007 · P1 · Implement app.js bootstrap
- On DOMContentLoaded: call `Data.load()`, `Stats.loadAll()`, initialize State
- Detect current page (`index.html` vs `pad.html`) and run appropriate init
- Register global error handler: `window.onerror` logs to console and shows user-facing toast
- If `pad.html`: call `PadApp.init()`

---

## PHASE 2 — Virtual Controller (controller.js)

### T-008 · P0 · Embed DualSense SVG in pad.html
- Port the complete DualSense SVG from `test.html` into `pad.html`
- Wrap in `<div class="pad-wrap" id="controller-wrap">`
- Keep all `data-btn` attributes and element IDs intact
- Add L2/R2 trigger indicators (`#trigger-l2`, `#trigger-r2`)
- Add empty `<g>` overlay groups: `#stick-arrows-left`, `#stick-arrows-right`, `#beat-ring-overlay`

### T-009 · P0 · Implement Controller.init() and highlight system
- `Controller.init(svgEl)`: store SVG reference, cache all `[data-btn]` elements in a Map
- `Controller.highlight(svgTargets, state, durationMs)`:
  - Remove all ctrl-* classes from targets
  - Add `ctrl-${state}` class
  - If durationMs is set, use setTimeout to revert to `ctrl-idle`
- `Controller.resetAll()`: remove all ctrl-* classes from all elements
- Map SVG targets to DOM elements: handle special cases (`LEFT_STICK` → `#LEFT_STICK g`, `trigger-l2` → `#trigger-l2`, etc.)

### T-010 · P1 · Implement stick direction arrow overlays
- Create 8 SVG `<path>` arrow elements per stick, arranged at 45° intervals
- Position using polar coordinates relative to stick center
- `Controller.showStickArrow(side, direction)`: show one arrow, hide others, add pulsing class
- `Controller.hideStickArrow(side)`: hide all arrows for that stick
- Arrows use `--accent-cyan` color with opacity 0.6; active arrow uses opacity 1 + glow
- Directions: UP, DOWN, LEFT, RIGHT, UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT

### T-011 · P1 · Implement stick knob animation for direction cues
- `Controller.animateStickTo(side, direction, intensity)`:
  - Convert direction enum to (x, y) normalized vector
  - Apply `transform: translate(${x * SCALE * intensity}px, ${y * SCALE * intensity}px)` to knob path
- `Controller.resetStick(side)`: return knob to center
- SCALE constant = 8px (same as test.html)
- Use CSS `transition: transform 80ms ease`

### T-012 · P1 · Implement lightbar animation
- `Controller.setLightbar(color)`: set fill attribute on `#LIGHTBAR` group
- Color states: `idle = rgba(0,0,0,0.3)`, `active = rgba(0,100,255,0.6)`, `perfect = #10b981`, `miss = #ef4444`
- Transition: CSS `transition: fill 150ms ease` already on `#LIGHTBAR`

### T-013 · P2 · Implement beat ring overlay
- Create SVG `<circle>` element centered on controller
- `Controller.pulseBeat()`: trigger `beat-pulse` keyframe animation (scale 1→1.05→1, 200ms)
- Sync to Metronome beat events

### T-014 · P2 · Implement step number label
- Floating `<div>` positioned absolutely over SVG, near active element
- Shows "STEP 1 / 4" text
- Fades in/out on step advance with CSS transition
- Hidden when not in active session

---

## PHASE 3 — Input System (input.js)

### T-015 · P0 · Implement gamepad connection lifecycle
- `window.addEventListener('gamepadconnected', ...)` and `gamepaddisconnected`
- Update `State.controller.isConnected` and `State.controller.gamepadIndex`
- Show/hide connection status badge in UI

### T-016 · P0 · Implement gamepad polling loop
- `requestAnimationFrame` based polling (only when `State.controller.isConnected`)
- Poll all 17 standard button indices (0–16)
- On button press: emit `{ type: "button_press", button: TOKEN }` via `Input.emit()`
- On button release: emit `{ type: "button_release", button: TOKEN }`
- Update `State.controller.activeButtons` Set
- Update `State.controller.l2Value` and `r2Value` from `gp.buttons[6].value` and `gp.buttons[7].value`
- Update `State.controller.leftStick` and `rightStick` from axes

### T-017 · P0 · Implement flick detection
- Track previous frame's stick magnitude per stick (LS, RS)
- FLICK_THRESHOLD = 0.7, NEUTRAL_THRESHOLD = 0.2
- When `current_magnitude > FLICK_THRESHOLD AND prev_magnitude < NEUTRAL_THRESHOLD`:
  - Compute angle via `Math.atan2(y, x)`
  - Quantize to 8 directions (each covers 45°)
  - Emit `{ type: "flick", source: "RS"|"LS", direction, directionAngle, timestamp }`
  - Set 200ms cooldown per stick to prevent re-fire
- Test with a DualSense connected; verify all 8 directions fire correctly

### T-018 · P1 · Implement hold detection
- HOLD_THRESHOLD = 0.6 (stick magnitude to qualify as held)
- HOLD_DURATION = 300ms (must sustain this long before emitting "hold_start")
- Track per-stick: `holdStart`, `holdDirection`, `holdEmitted`
- Emit `{ type: "hold_start", source, direction, timestamp }` after HOLD_DURATION
- Emit `{ type: "hold_end", source, direction, holdDuration }` when stick returns to neutral
- Button hold detection: L1, L2, R1, R2 emit `hold_start` immediately when `.pressed`

### T-019 · P1 · Implement rotation detection
- Track sequential directional history per stick (ring buffer, last 8 directions)
- CW rotation: UP → RIGHT → DOWN → LEFT (or any 270° arc in CW order)
- CCW rotation: UP → LEFT → DOWN → RIGHT
- Minimum arc: 180° (half rotation counts)
- Emit `{ type: "rotate_cw"|"rotate_ccw", source, degrees, timestamp }`
- Reset history after emit or after 1000ms inactivity

### T-020 · P2 · Keyboard fallback input
- Port KEY_MAP from `test.html` into input.js
- Map keyboard inputs to equivalent InputEvents
- Allow `Digit1`/`Digit2` for L2/R2
- Arrow keys simulate RS flick directions (for testing without a controller)
- Keyboard input flows through same `Input.emit()` pathway as gamepad

---

## PHASE 4 — Metronome (metronome.js)

### T-021 · P1 · Implement Web Audio metronome
- `Metronome.start(bpm)`: create AudioContext, begin scheduler loop with `setInterval(25ms)`
- Use scheduler-ahead pattern (ARCHITECTURE.md §4.6): schedule clicks 100ms ahead
- `Metronome.stop()`: clear interval, close AudioContext
- `Metronome.setBPM(newBpm)`: update bpm, next beat uses new duration
- `Metronome.pause()` / `Metronome.resume()`: suspend/resume AudioContext
- Click sound: short 1000Hz sine wave, 20ms duration, volume 0.3

### T-022 · P1 · Wire metronome beats to engine and UI
- Each scheduled beat calls `Engine.onBeat(beatNumber)` at the scheduled Web Audio time
- Each beat also updates `State.metronome.beat`
- `Controller.pulseBeat()` is called on each beat (T-013)
- Visual BPM indicator: number badge that flashes on beat

### T-023 · P2 · BPM control UI
- Range slider: 40–200 BPM, default 90
- Number display alongside slider, updates live
- +5 / -5 nudge buttons
- Tap-tempo button: `Metronome.tapTempo(timestamp)` — average last 4 taps
- BPM persisted to `State.settings.bpm` and localStorage on change

---

## PHASE 5 — Practice Engine (engine.js)

### T-024 · P0 · Implement Engine.start() and session state
- `Engine.start(moveId, options)`:
  - Call `Data.getMove(moveId)`, validate it exists
  - Flatten `move.inputs` into `_steps` array
  - Set `State.session = { isActive: true, currentStepIdx: 0, bpm: options.bpm, results: [], startTime: Date.now() }`
  - Call `Metronome.start(options.bpm)`
  - Call `Controller.resetAll()`
  - Call `_highlightStep(0)`
- `Engine.stop()`: set `isActive: false`, `Metronome.stop()`, `Controller.resetAll()`, clear timeouts

### T-025 · P0 · Implement step highlighting and advancement
- `_highlightStep(idx)`:
  - If idx > 0: revert previous step to idle
  - Highlight `_steps[idx].controller.svgTargets` as "next"
  - If stick involved: `Controller.showStickArrow(stick, direction)` and `Controller.animateStickTo(..., 0.5)`
  - Update `State.session.currentStepIdx = idx`
  - Update UI step panel: `UI.updateStepPanel(_steps[idx], idx, _steps.length)`
  - Record `_stepStartTime = performance.now()`
  - Set step timeout: `_steps[idx].beatValue * beatDuration * 2` → triggers miss on timeout
- `_advanceStep()`:
  - Clear current step timeout
  - `Controller.hideStickArrow(stick)` if applicable
  - Increment index; if done: `_completeSession()`, else `_highlightStep(idx)`

### T-026 · P0 · Implement Engine.onInput() and matchInput()
- `Engine.onInput(inputEvent)`:
  - Guard: if !session.isActive OR session.isPaused: return
  - Get current expected step from `_steps[currentStepIdx]`
  - Call `_matchInput(inputEvent, expectedStep)` — returns boolean
  - If match:
    - Compute `timingDelta = performance.now() - _stepStartTime - expectedBeatMs`
    - Get rating from `_rateTimingDelta(timingDelta)`
    - `Controller.highlight(targets, ratingToState, 400)`
    - Push to `State.session.results`
    - `_advanceStep()`
  - If no match but wrong button pressed (in "strict" mode): record miss
- Wire: input.js calls `Engine.onInput(event)` in its emit() function

### T-027 · P0 · Implement completeSession() and score calculation
- Average of all step scores → overall session score (0–100)
- Accuracy = (non-miss steps / total steps) × 100
- Call `Stats.recordSession({ moveId, score, accuracy, results, duration, bpm })`
- Call `Stats.updateXP(calculatedXP)` — returns `{ leveledUp, newLevel }` (for UI notification)
- Call `UI.showScoreOverlay(score, accuracy, results)`
- Emit `'session_complete'` custom event

### T-028 · P1 · Implement freeplay mode
- `Engine.startFreeplay(moveId)`:
  - Like `Engine.start()` but no metronome, no timeout, no timing scoring
  - Inputs are matched purely for correctness (hit/miss only)
  - Score per step: 100 for correct, 0 for wrong
  - Useful for learning without timing pressure

### T-029 · P1 · Implement drill mode
- `Engine.startDrill(drillId)`:
  - Load drill from `Data.getDrill(drillId)`
  - Expand `drill.moves × drill.repetitions` into a flat step sequence
  - Insert `gapBeats` pauses between moves
  - Start engine with the expanded sequence
  - Show overall drill progress (move X of Y in header)

### T-030 · P2 · Implement step timeout and auto-advance
- When `_stepTimeoutMs` elapses without correct input:
  - Record `{ rating: "miss", score: 0, timingDelta: null }`
  - `Controller.highlight(targets, "miss", 300)`
  - `_advanceStep()`
- In freeplay mode: no timeout (wait indefinitely)

### T-031 · P2 · Implement hold step type
- For steps with `type: "hold"`:
  - On `hold_start` event matching direction: begin hold timing
  - Animate stick toward direction with increasing intensity over `holdBeats` duration
  - On `hold_end` event: check if held long enough
  - Score based on hold duration accuracy vs expected `holdBeats`

---

## PHASE 6 — Move Library UI (ui.js + pad.html)

### T-032 · P1 · Build move library panel
- Render move cards: name, star rating (filled/empty stars), category badge, difficulty pill
- Click → `UI.showMoveDetail(move)`
- Search input: filters moves in real-time (calls `Data.searchMoves()`)
- Star filter: buttons 1★–5★ (multi-select), filters list
- Category tabs: All, Feint, Stepover, Ball Roll, Roulette, etc.
- Sort: by name, by stars, by last practiced

### T-033 · P1 · Build move detail panel
- Display: name, star rating, difficulty, category, description
- Tips accordion: collapsed by default, expand on click
- Input steps list: numbered steps with stick/button labels
- Video link: open in new tab (if `move.videoUrl` is non-empty)
- "Practice (Guided)" button → `Engine.start(move.id, currentSettings)`
- "Freeplay" button → `Engine.startFreeplay(move.id)`
- MoveStats preview: best score, last practiced, mastery badge
- "Back to Library" chevron button

### T-034 · P2 · Build step-by-step practice panel
- Shows in practice mode, replaces detail panel
- Current step: large text label (e.g. "Flick RS Right")
- Step indicator dots: filled = done, current = pulsing, future = empty
- Beat countdown: visual bar that depletes per beat (shows timing window)
- Live score running total in corner
- "Stop" button → `Engine.stop()` then confirm dialog
- Input history: last 5 steps shown as colored dots (green/yellow/red)

### T-035 · P2 · Build score overlay
- Slides up from bottom after session completes
- Overall score badge (0–100, colored by tier)
- Accuracy percentage
- Step-by-step breakdown: each step as colored dot with label
- XP gained display + level-up animation if applicable
- Action buttons: "Try Again", "Increase BPM (+5)", "Next Move", "Library"

### T-036 · P2 · Build stats dashboard (tab or slide-out panel)
- Total moves practiced, total sessions, total XP, current level
- Recent sessions list: move name, score, date
- Move mastery grid: 3×N grid of move cards with mastery indicator rings
- Best scores table: top 10 scores by move
- "Reset Progress" button with confirmation dialog

---

## PHASE 7 — index.html Landing Page

### T-037 · P2 · Build landing page
- Full-page dark hero: animated DualSense SVG (keyframe looping through button highlights)
- Headline: "Master Every Skill Move"
- Sub-headline: "React time training for EA Sports FC 25 on PS5"
- Stats row: "25+ Moves · 10 Sequences · 5 Drills" (loaded from moves.json)
- Feature cards (6): Virtual Controller / BPM Training / Progress Tracking / Skill Library / Offline Play / Move Sequences
- CTA button: "Start Training" → href to `pad.html`
- Footer: version, no backend required notice

---

## PHASE 8 — Polish & Extras

### T-038 · P3 · Add move preview animation in library
- When hovering a move card: auto-animate the virtual controller through that move's inputs at 60 BPM
- Use `Controller.previewMove(move)` which loops through inputs with `setInterval`
- Cancel on mouse leave

### T-039 · P3 · Add combo/sequence mode UI
- Sequence browser tab in library panel
- Sequence detail shows each move in order with transition tips
- "Practice Sequence" runs all moves back-to-back via `Engine.startDrill`

### T-040 · P3 · Toast notification system
- `UI.toast(message, type, durationMs)` — type: success/error/info
- Slide in from top-right, auto-dismiss
- Used for: controller connected/disconnected, level up, new high score, session saved

### T-041 · P3 · Settings panel
- Volume slider for metronome click sound
- Toggle: "Show hints" (coaching tips visible during practice)
- Toggle: "Strict mode" (wrong inputs count as misses)
- Toggle: "Auto-advance BPM" (increase BPM by 5 after 3 consecutive perfect sessions)
- Theme selector: Dark (default), Darker, High Contrast
- Save to localStorage automatically on change

### T-042 · P3 · Keyboard shortcut system
- Space: Start/Stop practice
- B: Start freeplay
- R: Restart session
- +/-: Adjust BPM ±5
- Escape: Close overlays
- Show shortcut hints in footer of pad.html

### T-043 · P3 · Move not-connected fallback
- When no gamepad connected: show large "Connect Controller" overlay on practice panel
- After 3 seconds: offer "Use Keyboard Instead" button
- Keyboard mode shows prominent "KB MODE" badge

### T-044 · P3 · Mastery badge system
- After 3 sessions with score ≥ 90: move gets "PRACTICED" badge (blue ring)
- After 10 sessions with score ≥ 85: move gets "MASTERED" badge (gold ring)
- Badges appear on move cards in library and in stats dashboard
- On first mastery: `UI.toast("🏆 Move Mastered: {name}", "success", 4000)`

### T-045 · P3 · Responsive layout
- Mobile (<768px): single column, controller centered top, library as bottom drawer
- Tablet (768–1024px): two column, library sidebar + controller center
- Desktop (>1024px): three column per wireframe in ARCHITECTURE.md
- Test touch events: all buttons respond to touchstart/touchend

---

## Implementation Order (Recommended Sequence)

```
Week 1:  T-001 → T-004 (Scaffold + Data)
         T-005 → T-007 (Data layer + bootstrap)

Week 2:  T-008 → T-014 (Virtual Controller)
         T-015 → T-020 (Input system)

Week 3:  T-021 → T-023 (Metronome)
         T-024 → T-027 (Engine core)

Week 4:  T-028 → T-035 (Engine modes + Library UI)
         T-036 → T-037 (Stats + Landing)

Week 5:  T-038 → T-045 (Polish)
         Bug fixes, mobile testing, performance review
```
