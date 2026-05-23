# PS5 Pad Mastery — Coding Rules & Guidelines

> These rules are non-negotiable. They exist to keep the codebase maintainable across contributors and future iterations.

---

## 1. Technology Rules

### 1.1 Stack Boundaries
- **HTML + Tailwind CDN + Vanilla JS only.** No React, Vue, Svelte, Alpine, Stimulus, or any other framework.
- **No build tools.** No Webpack, Vite, Rollup, Babel, TypeScript compiler. The files must run directly in a browser without a build step.
- **No external JS dependencies.** No lodash, date-fns, jQuery, or any npm package. Write the utility functions you need — they will be small.
- **ES Modules only.** All `.js` files use `export`/`import` with `<script type="module">`. No global `var` pollution.
- **Tailwind via CDN only.** Do not use a custom Tailwind config file. Use `class="..."` attributes for all layout/typography. Reserve `styles.css` for things Tailwind cannot do: `@keyframes`, complex SVG state animations, CSS custom properties, pseudo-element content.

### 1.2 Browser APIs Allowed
- Gamepad API (`navigator.getGamepads()`)
- Web Audio API (`AudioContext`)
- localStorage / sessionStorage
- Fetch API (for loading `moves.json`)
- `requestAnimationFrame` / `performance.now()`
- Custom Events (`new CustomEvent(...)`)
- CSS Animations + Transitions
- `structuredClone()` for deep copy

---

## 2. File & Folder Rules

### 2.1 Naming Conventions
| Artifact | Convention | Example |
|----------|-----------|---------|
| HTML files | lowercase, hyphen | `pad.html`, `index.html` |
| JS modules | camelCase | `state.js`, `engine.js` |
| CSS file | single file | `styles.css` |
| Data files | lowercase, hyphen | `moves.json` |
| JS functions | camelCase | `matchInput()`, `highlightStep()` |
| JS classes | PascalCase (avoid — use plain objects/functions) | `createStore()` not `new Store()` |
| CSS classes | lowercase, hyphen-separated | `ctrl-active`, `press-tag`, `pad-wrap` |
| State keys | camelCase | `currentStepIdx`, `isConnected` |
| Move IDs | snake_case | `elastico_r`, `la_croqueta_l` |
| SVG element IDs | SCREAMING_SNAKE_CASE | `LEFT_STICK`, `LS_KNOB`, `LIGHTBAR` |
| data-* attributes | lowercase, hyphen | `data-btn="L1"`, `data-move-id="elastico_r"` |

### 2.2 Module Structure
Each JS module must follow this template:
```js
// ─── module-name.js ───────────────────────────────────────────────────────────
// One-line description of what this module owns.

import { State } from './state.js';
// ... other imports

// ── Private state (module-scoped, not exported) ──
let _privateVar = null;
const _CONSTANT = 42;

// ── Private helpers ──
function _helperFn() { ... }

// ── Public API ──
export const ModuleName = {
  methodOne() { ... },
  methodTwo() { ... }
};
```

- Every module exports **exactly one named object** (the public API)
- Private helpers are prefixed with `_` and are NOT exported
- Constants are `SCREAMING_SNAKE_CASE` with `const`
- No default exports

---

## 3. JavaScript Rules

### 3.1 General
- **No `var`.** Use `const` by default, `let` only when reassignment is needed.
- **No `==`.** Always use `===` for equality checks.
- **No implicit type coercion.** Always explicit: `Number(str)`, `String(n)`, `Boolean(val)`.
- **No `eval()`, `Function()`, or `innerHTML` with user-controlled data.**
- **Prefer array methods** over `for` loops: `map`, `filter`, `find`, `some`, `every`, `reduce`. Use `for...of` when index is needed or for performance-critical paths.
- **No mutation of function arguments.** Clone first if you need to modify.
- **No deeply nested ternaries.** Max two levels. If you need three conditions, use `if/else` or a lookup object.

### 3.2 Async/Error Handling
- All `fetch()` calls must have `try/catch`. On error: log to console AND show user-facing message.
- `localStorage` reads/writes must be in `try/catch` — quota can be exceeded.
- Never swallow errors silently: at minimum `console.warn(err)`.
- Promises must always have `.catch()` or be `await`ed inside `try/catch`.

### 3.3 DOM
- Cache DOM queries that are accessed more than once in a `const` at module scope or inside `init()`.
- Never call `document.querySelector` inside a `requestAnimationFrame` loop. Cache it.
- Use `element.classList.add/remove/toggle` not `element.style.*` for visual state. Exception: stick knob transforms where CSS class is impractical.
- Never directly mutate `innerHTML` with user-generated content. Use `textContent` for plain strings or build DOM nodes programmatically.
- All DOM mutations that happen in response to an animation frame must be batched in that same frame.

### 3.4 Performance
- The `requestAnimationFrame` callback must complete in < 5ms to maintain 60fps. Profile it.
- Do not create new objects inside `requestAnimationFrame` loops — reuse or use object pools.
- Debounce localStorage writes: minimum 500ms after last change.
- Do not fetch `moves.json` more than once per page load. Cache the result in `Data._cache`.

### 3.5 Events
- Use native DOM `CustomEvent` for cross-module communication that cannot go through State.
- Event names use `SCREAMING_SNAKE_CASE` prefixed with module: `ENGINE_STEP_COMPLETE`, `INPUT_FLICK_DETECTED`
- Never attach more than one `gamepadconnected` listener. Clean up with `removeEventListener` when appropriate.
- Input event listeners attached in `init()` must be removable (store references, don't use anonymous functions for critical listeners).

---

## 4. Virtual Controller Rules

### 4.1 SVG Integrity
- **Do not modify the SVG paths or geometry.** The DualSense shape is a fixed asset.
- Only modify SVG elements via: CSS class changes, `setAttribute('fill', ...)` on `#LIGHTBAR`, `style.transform` on knob paths.
- All SVG state classes follow the `ctrl-*` prefix convention.
- New overlay elements (arrows, rings) are injected into designated empty `<g>` groups only.

### 4.2 Button Highlighting
- The `ctrl-active` state must never be set by `controller.js` directly — only `engine.js` calls `Controller.highlight()`.
- `controller.js` may only set `ctrl-idle` as a cleanup operation.
- Mirror physical inputs from `input.js` to the SVG using `Controller.markButtonPressed(token)` — this is separate from the guided session highlights and uses a different, dimmer CSS class.
- Stick knob transform values: cap at ±`STICK_SCALE` pixels (8px default). Never animate beyond the stick ring boundary.

### 4.3 Direction Arrows
- Arrow elements for each stick must be pre-created in `Controller.init()`, not dynamically created per step.
- Arrows are shown/hidden via CSS class, not `display:none` (to allow transitions).
- All 8 directional arrows exist in DOM at all times — only opacity and scale change.

---

## 5. Practice Engine Rules

### 5.1 Timing
- **Never use `setInterval` or `setTimeout` for beat timing.** Use the Web Audio API scheduler pattern exclusively. This prevents drift over long sessions.
- `performance.now()` for all timing measurements within the engine. Never `Date.now()`.
- Step timeouts (for auto-miss on no input) may use `setTimeout` because they are one-shot and drift is acceptable (±50ms).
- The "expected beat time" for a step is computed as: `stepIndex × beatDuration` from the session start, not accumulated `setTimeout` delays.

### 5.2 Input Matching
- The `matchInput()` function must be **pure** — no side effects, same input = same output.
- Direction matching uses ±tolerance degrees (default 45°). Do NOT use string equality on directions for the matching function — convert to angles and use angular distance.
- Held buttons (e.g. L2) are checked against `State.controller.activeButtons` (a live Set) — the matching function reads from State but does not write to it.
- A "miss" is only recorded when either: (a) the step timeout fires, or (b) strict mode is enabled AND a wrong input is received.

### 5.3 Session Lifecycle
- A session can only be in one of: `idle`, `active`, `paused`, `complete`. No other states.
- `Engine.stop()` must be callable from any state and must always clean up (clear timers, stop metronome, reset controller).
- Sessions that are abandoned (user navigates away) must still call `Engine.stop()` — listen for `window.beforeunload`.
- A session with 0 steps is invalid — `Engine.start()` must throw an error if `move.inputs` is empty.

---

## 6. Data Rules

### 6.1 moves.json
- **All move IDs are globally unique** — do not reuse IDs even if moves are similar.
- Every move must have at least 1 input step. Zero-step moves will crash the engine.
- The `svgTargets` array must contain only valid SVG element IDs from the DualSense SVG. Using an unknown ID silently fails — `controller.js` must warn in console if a target is not found.
- `beatValue` for a step must be > 0. Minimum practical value is 0.25 (16th note at any BPM).
- `tolerance` defaults to 45 if not specified. For precision moves (e.g. diagonal flicks), set to 30.

### 6.2 localStorage
- All localStorage keys must be prefixed with `pspm_` to avoid collisions.
- Never store sensitive data (there isn't any, but maintain the habit).
- The `pspm_sessions` array is capped at 100 entries. Always enforce this cap before writing.
- On first load, initialize all expected keys if they don't exist — never assume keys exist.
- `Stats.loadAll()` must handle malformed JSON gracefully (return defaults, not throw).

---

## 7. CSS/Tailwind Rules

### 7.1 Tailwind Usage
- Use Tailwind for: layout (flex, grid, padding, margin, sizing), typography (font-size, weight, color classes), responsive breakpoints (`md:`, `lg:`), hover states (`hover:`).
- Do not use Tailwind for: complex animations, SVG state classes, CSS custom property assignments.
- Dark mode: the `<html>` element has `class="dark"`. Use Tailwind `dark:` variants sparingly — most colors are already dark-themed via CSS vars.
- Use `@apply` in `styles.css` only for multi-element reusable components (e.g. `.btn-primary`). Do not `@apply` more than 5 classes in one rule.

### 7.2 Custom CSS
- Animations live in `styles.css` only. No inline `<style>` tags in HTML except for critical-path above-the-fold styles (there shouldn't be any).
- CSS custom properties for colors (`--accent-cyan`, etc.) are defined in `:root` and used via `var()` in both Tailwind arbitrary values and custom CSS.
- Animation durations: `60–80ms` for button flashes, `150ms` for state transitions, `400ms` for overlays, `200ms` for beat pulse.
- Use `will-change: transform` on SVG knob paths (the stick knobs that animate every frame).

---

## 8. Accessibility Rules
- All interactive elements (buttons, library cards) must be keyboard-accessible (`tabindex`, `Enter`/`Space` activation).
- SVG `<g>` elements with `data-btn` must have `role="button"` and `aria-label` matching the button name.
- Beat pulse visual must not be the only feedback — accompany with audio (metronome click).
- Color is never the only differentiator for step ratings — also use icons/text labels.
- Score overlay must be announced to screen readers via `aria-live="polite"` on the score container.

---

## 9. Comments & Documentation
- Write **zero comments** for obvious code. `const bpm = State.get('metronome').bpm` needs no comment.
- Write a comment only when the **WHY is non-obvious**: hardware quirks, API gotchas, timing invariants, magic numbers.
- Examples of required comments:
  ```js
  // Web Audio clock runs ahead of real time — schedule LOOKAHEAD_MS into the future
  // to prevent gaps when the main thread is briefly blocked.
  
  // Flick cooldown prevents double-fires: DualSense hardware bounces during fast RS flicks.
  
  // atan2 returns [-π, π]; add 2π when negative to normalize to [0, 2π] before quantizing.
  ```
- No commented-out code in committed files. Delete dead code; git history preserves it.
- Module-level one-liner at top of each file explains ownership (see §2.2 template).

---

## 10. Testing & Verification
- Before marking any Task complete: manually test with a physical DualSense connected via USB.
- For each new move added to moves.json: run the engine in guided mode and verify all steps highlight correctly.
- Test all 8 stick flick directions (up/down/left/right/diagonals) with the flick detector.
- Test BPM range extremes: 40 BPM and 200 BPM — verify no timing drift after 30 seconds.
- Test localStorage eviction: fill 100 sessions, add one more — verify FIFO eviction works.
- Test no-controller mode: verify keyboard fallback activates and all moves are practicable.
- Test mobile: verify touch events work on move library cards and virtual controller buttons.
