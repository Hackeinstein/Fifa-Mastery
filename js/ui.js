// ─── ui.js ───────────────────────────────────────────────────────────────────
// DOM render helpers: move cards, detail panel, step panel, score overlay, etc.

const DIFFICULTY_COLORS = {
  beginner: '#10b981',
  intermediate: '#3b82f6',
  advanced: '#f59e0b',
  expert: '#ef4444'
};

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert'
};

const MASTERY_LABELS = ['New', 'Learning', 'Practiced', 'Mastered'];
const MASTERY_COLORS = ['#6b7280', '#3b82f6', '#f59e0b', '#10b981'];

const CATEGORY_LABELS = {
  feint: 'Feint', stepover: 'Stepover', ball_roll: 'Ball Roll',
  roulette: 'Roulette', elastico: 'Elastico', rainbow: 'Rainbow',
  la_croqueta: 'La Croqueta', combo: 'Combo', fake: 'Fake', chop: 'Chop'
};

export const UI = {
  // ── Move Library ──
  renderMoveCard(move, stats) {
    const mastery = stats ? stats.masteryLevel : 0;
    const starsHtml = Array.from({ length: 5 }, (_, i) => {
      const filled = i < move.stars;
      return `<span style="color:${filled ? '#f59e0b' : '#374151'}">★</span>`;
    }).join('');

    return `
      <div class="move-card" data-move-id="${move.id}" role="button" tabindex="0" aria-label="${move.name}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.35rem;">
          <span style="font-weight:700;font-size:0.9rem;color:var(--text-primary)">${move.name}</span>
          <span style="font-size:0.7rem;display:flex;gap:1px;">${starsHtml}</span>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.3rem;">
          <span style="font-size:0.65rem;padding:2px 8px;border-radius:10px;background:${DIFFICULTY_COLORS[move.difficulty]}20;color:${DIFFICULTY_COLORS[move.difficulty]};border:1px solid ${DIFFICULTY_COLORS[move.difficulty]}40;">
            ${DIFFICULTY_LABELS[move.difficulty]}
          </span>
          <span style="font-size:0.65rem;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);">
            ${CATEGORY_LABELS[move.category] || move.category}
          </span>
          ${mastery > 0 ? `<span style="font-size:0.65rem;padding:2px 8px;border-radius:10px;background:${MASTERY_COLORS[mastery]}20;color:${MASTERY_COLORS[mastery]};border:1px solid ${MASTERY_COLORS[mastery]}40;">${MASTERY_LABELS[mastery]}</span>` : ''}
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          ${move.description}
        </div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.3rem;">
          ${move.inputs.length} step${move.inputs.length > 1 ? 's' : ''}
        </div>
      </div>
    `;
  },

  renderLibrary(moves, filter, statsMap) {
    let html = '';
    for (const move of moves) {
      html += this.renderMoveCard(move, statsMap ? statsMap[move.id] : null);
    }
    if (moves.length === 0) {
      html = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">No moves found</div>';
    }
    return html;
  },

  // ── Move Detail Panel ──
  renderMoveDetail(move, stats) {
    const mastery = stats ? stats.masteryLevel : 0;
    const starsHtml = Array.from({ length: 5 }, (_, i) => {
      const filled = i < move.stars;
      return `<span style="color:${filled ? '#f59e0b' : '#374151'};font-size:1.2rem;">★</span>`;
    }).join('');

    const stepsHtml = move.inputs.map((step, i) => `
      <div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border-subtle);">
        <span style="width:24px;height:24px;border-radius:50%;background:var(--accent-cyan);color:#000;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;">${i + 1}</span>
        <span style="font-size:0.8rem;">${step.label}</span>
        <span style="margin-left:auto;font-size:0.65rem;color:var(--text-muted);">${step.beatValue} beat${step.beatValue !== 1 ? 's' : ''}</span>
      </div>
    `).join('');

    const tipsHtml = move.tips && move.tips.length > 0 ? `
      <div style="margin-top:0.75rem;">
        <div style="font-size:0.75rem;color:var(--accent-yellow);font-weight:600;margin-bottom:0.3rem;">Coaching Tips</div>
        ${move.tips.map(t => `<div style="font-size:0.7rem;color:var(--text-muted);padding:0.2rem 0;">• ${t}</div>`).join('')}
      </div>
    ` : '';

    const statsHtml = stats ? `
      <div style="margin-top:0.75rem;display:flex;gap:1rem;flex-wrap:wrap;">
        <div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent-green);">${stats.bestScore || '-'}</div><div style="font-size:0.6rem;color:var(--text-muted);">Best</div></div>
        <div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:var(--accent-blue);">${stats.attempts || 0}</div><div style="font-size:0.6rem;color:var(--text-muted);">Attempts</div></div>
        <div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:${MASTERY_COLORS[mastery]};text-transform:uppercase;">${MASTERY_LABELS[mastery]}</div><div style="font-size:0.6rem;color:var(--text-muted);">Mastery</div></div>
      </div>
    ` : '';

    return `
      <div style="padding:0.5rem;">
        <button id="btn-back-library" style="background:none;border:none;color:var(--accent-blue);cursor:pointer;font-size:0.8rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.25rem;">
          ← Library
        </button>
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
          <h2 style="font-size:1.3rem;font-weight:700;color:var(--text-primary);">${move.name}</h2>
          <div>${starsHtml}</div>
        </div>
        <div style="display:flex;gap:0.4rem;margin-bottom:0.5rem;">
          <span style="font-size:0.65rem;padding:2px 10px;border-radius:10px;background:${DIFFICULTY_COLORS[move.difficulty]}20;color:${DIFFICULTY_COLORS[move.difficulty]};border:1px solid ${DIFFICULTY_COLORS[move.difficulty]}40;">
            ${DIFFICULTY_LABELS[move.difficulty]}
          </span>
          <span style="font-size:0.65rem;padding:2px 10px;border-radius:10px;background:rgba(255,255,255,0.05);color:var(--text-muted);">
            ${CATEGORY_LABELS[move.category] || move.category}
          </span>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.5;margin-bottom:0.75rem;">${move.description}</p>
        ${statsHtml}
        <div style="margin-top:0.75rem;">
          <div style="font-size:0.75rem;color:var(--text-primary);font-weight:600;margin-bottom:0.4rem;">Input Sequence</div>
          ${stepsHtml}
        </div>
        ${tipsHtml}
        <div style="display:flex;gap:0.5rem;margin-top:1rem;">
          <button id="btn-practice-guided" data-move-id="${move.id}" style="flex:1;padding:0.6rem;border:none;border-radius:8px;background:var(--accent-cyan);color:#000;font-weight:700;font-size:0.8rem;cursor:pointer;">
            ▶ Practice (Guided)
          </button>
          <button id="btn-practice-freeplay" data-move-id="${move.id}" style="flex:1;padding:0.6rem;border:1px solid var(--accent-cyan);border-radius:8px;background:transparent;color:var(--accent-cyan);font-weight:700;font-size:0.8rem;cursor:pointer;">
            Freeplay
          </button>
        </div>
      </div>
    `;
  },

  // ── Step Panel ──
  updateStepPanel(step, idx, total, results) {
    const panel = document.getElementById('step-panel');
    if (!panel) return;

    const resultsHtml = results && results.length > 0 ? results.slice(-5).map(r => {
      const color = r.rating === 'perfect' ? 'var(--accent-green)' : r.rating === 'good' ? 'var(--accent-yellow)' : r.rating === 'ok' ? '#f97316' : 'var(--accent-red)';
      return `<div class="step-dot" style="background:${color};" title="${r.rating}"></div>`;
    }).join('') : '';

    const dotsHtml = Array.from({ length: total }, (_, i) => {
      let cls = '';
      if (i < idx) cls = 'done';
      else if (i === idx) cls = 'current';
      return `<div class="step-dot ${cls}"></div>`;
    }).join('');

    const score = results && results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
      : 0;

    const reqHtml = step ? this._buildRequirements(step) : '';

    panel.innerHTML = `
      <div style="margin-bottom:0.5rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Step ${idx + 1} of ${total}</div>
        <div style="font-size:1rem;font-weight:700;color:var(--accent-cyan);margin:0.2rem 0;">${step ? step.label : '...'}</div>
        <div style="margin:0.2rem 0;">${reqHtml}</div>
        <div id="live-section" style="min-height:1.4rem;margin:0.25rem 0;"></div>
        <div style="display:flex;gap:0.25rem;margin:0.3rem 0;">${dotsHtml}</div>
        <div style="display:flex;gap:0.3rem;align-items:center;margin:0.3rem 0;">
          <span style="font-size:0.7rem;color:var(--text-muted);">Recent:</span>
          ${resultsHtml}
        </div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">Score: ${score}</div>
      </div>
      <button id="btn-stop-session" style="width:100%;padding:0.5rem;border:1px solid var(--accent-red);border-radius:8px;background:transparent;color:var(--accent-red);font-weight:700;font-size:0.8rem;cursor:pointer;margin-top:0.5rem;">
        ⏹ Stop
      </button>
    `;
  },

  _buildRequirements(step) {
    const chip = (label, value) =>
      `<span style="display:inline-flex;gap:3px;font-size:0.6rem;padding:1px 5px;border-radius:4px;` +
      `background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid rgba(255,255,255,0.08);">` +
      `<span style="opacity:0.5">${label}</span>${value}</span>`;
    const parts = [chip('TYPE', step.type)];
    if (step.controller.stick) parts.push(chip('STICK', step.controller.stick));
    if (step.controller.direction) parts.push(chip('DIR', step.controller.direction));
    if (step.controller.buttons?.length) parts.push(chip('BTN', step.controller.buttons.join('+')));
    return `<div style="display:flex;gap:3px;flex-wrap:wrap;">${parts.join('')}</div>`;
  },

  updateLiveSection(detail) {
    const el = document.getElementById('live-section');
    if (!el) return;
    const { analysis, step } = detail;

    const chip = (label, value, ok) => {
      const col = ok === true ? '#10b981' : ok === false ? '#ef4444' : '#6b7280';
      const ico = ok === true ? '✓' : ok === false ? '✗' : '';
      return `<span style="display:inline-flex;gap:2px;align-items:center;font-size:0.6rem;padding:1px 6px;border-radius:4px;` +
        `background:${col}18;color:${col};border:1px solid ${col}40;">` +
        `<span style="opacity:0.6">${label}</span>${value}${ico ? ` ${ico}` : ''}</span>`;
    };

    const parts = [];
    const typeVal = analysis.typeOk
      ? analysis.inputType
      : `${analysis.inputType}→${analysis.expectedType}`;
    parts.push(chip('TYPE', typeVal, analysis.typeOk));

    if (analysis.stickOk !== null) {
      const got = analysis.inputStick || '?';
      const stickVal = analysis.stickOk ? got : `${got}→${analysis.expectedStick}`;
      parts.push(chip('STICK', stickVal, analysis.stickOk));
    }

    if (analysis.dirOk !== null) {
      const dirVal = analysis.angleDiff !== null
        ? `${analysis.inputDir} ${analysis.angleDiff}°`
        : (analysis.inputDir || '?');
      parts.push(chip('DIR', dirVal, analysis.dirOk));
    }

    if (step.controller.buttons?.length) {
      const btnVal = analysis.buttonsOk ? 'held' : (analysis.missingBtns.join('+') || '?') + '?';
      parts.push(chip('BTN', btnVal, analysis.buttonsOk));
    }

    el.innerHTML = `<div style="display:flex;gap:3px;flex-wrap:wrap;">${parts.join('')}</div>`;
  },

  // ── Score Overlay ──
  showScoreOverlay(score, accuracy, results, xpData) {
    // Remove existing overlay
    const existing = document.querySelector('.score-overlay');
    if (existing) existing.remove();

    const tierColor = score >= 85 ? 'var(--accent-green)' : score >= 70 ? 'var(--accent-yellow)' : score >= 50 ? '#f97316' : 'var(--accent-red)';
    const tierLabel = score >= 85 ? 'Excellent!' : score >= 70 ? 'Good Job!' : score >= 50 ? 'Keep Practicing' : 'Needs Work';

    const stepsHtml = results.map((r, i) => {
      const color = r.rating === 'perfect' ? 'var(--accent-green)' : r.rating === 'good' ? 'var(--accent-yellow)' : r.rating === 'ok' ? '#f97316' : 'var(--accent-red)';
      return `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.7rem;color:var(--text-muted);">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
        <span>Step ${i + 1}: ${r.rating.toUpperCase()}</span>
        ${r.timingDelta !== null ? `<span style="margin-left:auto;">${r.timingDelta > 0 ? '+' : ''}${r.timingDelta}ms</span>` : ''}
      </div>`;
    }).join('');

    const xpHtml = xpData ? `
      <div style="margin:0.75rem 0;padding:0.5rem;background:rgba(59,130,246,0.1);border-radius:8px;">
        <span style="color:var(--accent-blue);font-weight:700;">+${xpData.xpGained} XP</span>
        ${xpData.leveledUp ? `<span style="color:var(--accent-yellow);font-weight:700;margin-left:0.5rem;">🎉 Level ${xpData.newLevel}!</span>` : ''}
      </div>
    ` : '';

    const overlay = document.createElement('div');
    overlay.className = 'score-overlay';
    overlay.innerHTML = `
      <div class="score-card" style="position:relative;">
        <button class="btn-score-close" style="position:absolute;top:0.6rem;right:0.75rem;background:none;border:none;color:var(--text-muted);font-size:1.3rem;cursor:pointer;line-height:1;padding:0.1rem 0.3rem;border-radius:4px;" title="Close">&times;</button>
        <div style="font-size:3rem;font-weight:900;color:${tierColor};margin-bottom:0.25rem;">${score}</div>
        <div style="font-size:1rem;color:${tierColor};margin-bottom:0.5rem;">${tierLabel}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem;">Accuracy: ${accuracy}%</div>
        ${xpHtml}
        <div style="text-align:left;max-height:180px;overflow-y:auto;margin-bottom:1rem;padding-right:2px;">${stepsHtml}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="btn-score-retry" style="flex:1;padding:0.6rem;border:none;border-radius:8px;background:var(--accent-cyan);color:#000;font-weight:700;font-size:0.8rem;cursor:pointer;">Try Again</button>
          <button class="btn-score-library" style="flex:1;padding:0.6rem;border:1px solid var(--border-subtle);border-radius:8px;background:transparent;color:var(--text-primary);font-weight:700;font-size:0.8rem;cursor:pointer;">Library</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  },

  hideScoreOverlay() {
    const overlay = document.querySelector('.score-overlay');
    if (overlay) overlay.remove();
  },

  // ── Connection Status ──
  setConnectionStatus(connected, name) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const ctrlName = document.getElementById('controller-name');
    if (dot && text) {
      if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
      } else {
        dot.classList.remove('connected');
        text.textContent = 'No controller';
      }
    }
    if (ctrlName) ctrlName.textContent = name || '';
  },

  // ── Toast Notifications ──
  toast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },

  // ── Stats Dashboard ──
  renderStats(allStats, sessions, user) {
    const masteredCount = Object.values(allStats).filter(s => s.masteryLevel >= 3).length;
    const practicedCount = Object.values(allStats).filter(s => s.masteryLevel >= 1).length;
    const totalSessions = sessions.length;

    return `
      <div style="padding:1rem;">
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:0.75rem;">Stats Dashboard</h2>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:1rem;">
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:10px;padding:0.75rem;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-cyan);">${totalSessions}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Sessions</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:10px;padding:0.75rem;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">${masteredCount}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Mastered</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:10px;padding:0.75rem;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-yellow);">${practicedCount}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Practiced</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:10px;padding:0.75rem;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue);">${user ? user.level : 1}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">Level · ${user ? user.xp : 0} XP</div>
          </div>
        </div>
        ${sessions.length > 0 ? `
          <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin-bottom:0.4rem;">Recent Sessions</div>
          ${sessions.slice(0, 5).map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.35rem 0;border-bottom:1px solid var(--border-subtle);font-size:0.75rem;">
              <span>${s.moveId}</span>
              <span style="color:var(--accent-cyan);font-weight:600;">${s.score}</span>
              <span style="color:var(--text-muted);">${s.accuracy}%</span>
              <span style="color:var(--text-muted);font-size:0.65rem;">${new Date(s.timestamp).toLocaleDateString()}</span>
            </div>
          `).join('')}
        ` : '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:1rem;">No sessions yet</div>'}
        <button id="btn-reset-stats" style="width:100%;padding:0.5rem;border:1px solid var(--accent-red);border-radius:8px;background:transparent;color:var(--accent-red);font-size:0.75rem;cursor:pointer;margin-top:1rem;">Reset All Progress</button>
      </div>
    `;
  },

  // ── Sequence / Drill Cards ──
  renderSequenceCard(seq, movesMap) {
    const moveNames = (seq.moves || []).map(id => {
      const m = movesMap[id];
      return m ? m.name : id;
    });
    return `
      <div class="move-card" data-seq-id="${seq.id}" role="button" tabindex="0" aria-label="${seq.name}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.3rem;">
          <span style="font-weight:700;font-size:0.85rem;color:var(--text-primary)">${seq.name}</span>
          <span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);">${seq.moves.length} moves</span>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.3rem;">${moveNames.join(' → ')}</div>
        ${seq.description ? `<div style="font-size:0.65rem;color:var(--text-muted);line-height:1.3;">${seq.description}</div>` : ''}
      </div>
    `;
  },

  renderDrillCard(drill, movesMap) {
    const moveNames = (drill.moves || []).map(id => {
      const m = movesMap[id];
      return m ? m.name : id;
    });
    const reps = drill.repetitions || 1;
    return `
      <div class="move-card" data-drill-id="${drill.id}" role="button" tabindex="0" aria-label="${drill.name}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.3rem;">
          <span style="font-weight:700;font-size:0.85rem;color:var(--text-primary)">${drill.name}</span>
          <span style="font-size:0.6rem;padding:1px 6px;border-radius:8px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.3);">${drill.moves.length} × ${reps}</span>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.3rem;">${moveNames.join(' · ')}</div>
        ${drill.bpm ? `<div style="font-size:0.62rem;color:var(--text-muted);">${drill.bpm} BPM</div>` : ''}
      </div>
    `;
  }
};
