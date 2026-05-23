# Fifa Mastery

**Live:** [fifa-mastery.pages.dev](https://fifa-mastery.pages.dev/)

A browser-based FIFA skill-move trainer. Learn, drill, and master skill moves using your DualSense (or any gamepad) — with real-time input feedback, BPM-locked practice, and a full move library.

---

## Features

- **Move Library** — Browse moves by category, difficulty, and star rating. Filter and search across the full catalog.
- **Guided Practice** — Step-by-step input prompts with live feedback on stick direction, buttons, and timing. BPM-locked mode keeps you on beat.
- **Freeplay Mode** — No timeout, no pressure. Every input scores as perfect — just build the muscle memory.
- **Sequences** — Chain multiple moves back-to-back and practice the full combo in one session.
- **Drills** — Repeat a move (or set of moves) for a defined number of reps. Tracks results across the full session.
- **Gamepad Support** — DualSense first-class; works with any browser-recognized controller. Visual SVG overlay shows live stick position and button state.
- **Metronome** — Web Audio API beat scheduler. BPM configurable per-move or globally. Visual + haptic pulse on beat.
- **Progress Tracking** — Per-move stats (attempts, perfect rate, best streak) persisted to `localStorage`.

## Controls

| Action | Input |
|---|---|
| Navigate library | D-pad / left stick |
| Select move | Cross (×) |
| Pause / resume | Options |
| Back to library | Circle (○) |
| Toggle BPM | L1 |

## Tech Stack

- Vanilla JS ES Modules — no framework, no build step
- Tailwind CSS (CDN) + custom `styles.css`
- Gamepad API (polling at 60 fps)
- Web Audio API (metronome scheduler)
- Cloudflare Pages (hosting)

## Project Structure

```
├── index.html          # Landing / redirect
├── pad.html            # Main app shell
├── js/
│   ├── app.js          # Bootstrap, routing, event wiring
│   ├── engine.js       # Practice session logic, timing, scoring
│   ├── controller.js   # Gamepad polling, input normalization
│   ├── ui.js           # Render functions (library, cards, step panel)
│   ├── data.js         # moves.json loader and query helpers
│   ├── state.js        # Shared reactive state
│   ├── metronome.js    # BPM scheduler
│   └── storage.js      # localStorage helpers
├── css/
│   └── styles.css
├── data/
│   └── moves.json      # Move database (moves, sequences, drills)
└── struct/             # Internal docs (architecture, rules, tasks)
```

## Development

No build tools required. Serve with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080/pad.html`.
