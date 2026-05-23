// ─── stats.js ────────────────────────────────────────────────────────────────
// localStorage persistence: sessions, move stats, XP, mastery levels.

const PREFIX = 'pspm_';
const MAX_SESSIONS = 100;

const _defaultMoveStats = () => ({
  moveId: '',
  attempts: 0,
  bestScore: 0,
  avgScore: 0,
  totalPerfects: 0,
  lastPracticed: null,
  masteryLevel: 0
});

const _defaultUser = () => ({
  name: 'Player',
  createdAt: new Date().toISOString(),
  level: 1,
  xp: 0
});

const _safeRead = (key, fallback) => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Stats: failed to read ${key}`, e);
    return fallback;
  }
};

const _safeWrite = (key, data) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Stats: failed to write ${key} (quota exceeded?)`, e);
  }
};

const _levelThresholds = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000, 20000];

const _calcLevel = (xp) => {
  let level = 1;
  for (let i = 1; i < _levelThresholds.length; i++) {
    if (xp >= _levelThresholds[i]) level = i + 1;
    else break;
  }
  return level;
};

const _calcMasteryLevel = (stats) => {
  if (!stats || stats.attempts === 0) return 0;
  if (stats.attempts >= 10 && stats.avgScore >= 85) return 3;
  if (stats.attempts >= 3 && stats.avgScore >= 70) return 2;
  if (stats.attempts >= 1) return 1;
  return 0;
};

export const Stats = {
  loadAll() {
    const moveStats = _safeRead('move_stats', {});
    const sessions = _safeRead('sessions', []);
    const user = _safeRead('user_profile', _defaultUser());
    const settings = _safeRead('settings', { bpm: 90, volume: 0.5, showHints: true, strictMode: false, bpmEnabled: false, layoutPreset: 'standard', inputMap: {} });
    return { moveStats, sessions, user, settings };
  },

  saveMoveStats(moveId, sessionResult) {
    const allStats = _safeRead('move_stats', {});
    let ms = allStats[moveId];
    if (!ms) {
      ms = _defaultMoveStats();
      ms.moveId = moveId;
    }
    ms.attempts++;
    ms.bestScore = Math.max(ms.bestScore, sessionResult.score);
    ms.avgScore = Math.round(((ms.avgScore * (ms.attempts - 1)) + sessionResult.score) / ms.attempts);
    ms.totalPerfects += sessionResult.results.filter(r => r.rating === 'perfect').length;
    ms.lastPracticed = new Date().toISOString();
    ms.masteryLevel = _calcMasteryLevel(ms);
    allStats[moveId] = ms;
    _safeWrite('move_stats', allStats);
    return ms;
  },

  saveSession(sessionData) {
    let sessions = _safeRead('sessions', []);
    sessions.push(sessionData);
    // FIFO eviction
    while (sessions.length > MAX_SESSIONS) {
      sessions.shift();
    }
    _safeWrite('sessions', sessions);
  },

  recordSession(data) {
    const { moveId, score, accuracy, results, duration, bpm } = data;
    const sessionData = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      moveId,
      bpm,
      score,
      accuracy,
      stepResults: results,
      duration
    };
    // Save session
    this.saveSession(sessionData);
    // Update move stats
    const newStats = this.saveMoveStats(moveId, { score, accuracy, results });
    // Update XP
    const baseXP = 10;
    const accuracyMult = accuracy / 100;
    const bpmMult = 1 + Math.min((bpm - 60) / 200, 1);
    const consecutivePerfects = results.filter(r => r.rating === 'perfect').length;
    const streakBonus = 1 + consecutivePerfects * 0.1;
    const xpGained = Math.round(baseXP * accuracyMult * bpmMult * streakBonus);
    const levelResult = this.updateXP(xpGained);
    return { sessionData, newStats, xpGained, ...levelResult };
  },

  updateXP(amount) {
    let user = _safeRead('user_profile', _defaultUser());
    const oldLevel = _calcLevel(user.xp);
    user.xp += amount;
    const newLevel = _calcLevel(user.xp);
    const leveledUp = newLevel > oldLevel;
    _safeWrite('user_profile', user);
    return { newXP: user.xp, leveledUp, newLevel };
  },

  getMoveStats(moveId) {
    const allStats = _safeRead('move_stats', {});
    return allStats[moveId] || _defaultMoveStats();
  },

  getRecentSessions(n = 10) {
    const sessions = _safeRead('sessions', []);
    return sessions.slice(-n).reverse();
  },

  getUserProfile() {
    return _safeRead('user_profile', _defaultUser());
  },

  getMasteredMoveIds() {
    const allStats = _safeRead('move_stats', {});
    return Object.keys(allStats).filter(id => allStats[id].masteryLevel >= 3);
  },

  getSettings() {
    return _safeRead('settings', { bpm: 90, volume: 0.5, showHints: true, strictMode: false, bpmEnabled: false, layoutPreset: 'standard', inputMap: {} });
  },

  saveSettings(settings) {
    _safeWrite('settings', settings);
  },

  resetAll() {
    // Clear all pspm_* keys
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }
};
