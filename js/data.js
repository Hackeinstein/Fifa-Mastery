// ─── data.js ──────────────────────────────────────────────────────────────────
// Data loading, parsing, querying moves.json. Single cached fetch per page load.

import { State } from './state.js';

let _cache = null;

const _validateMove = (move) => {
  const required = ['id', 'name', 'stars', 'category', 'difficulty', 'inputs'];
  for (const field of required) {
    if (move[field] === undefined || move[field] === null) {
      console.warn(`Move "${move.name || move.id}" missing required field: ${field}`);
      return false;
    }
  }
  if (!Array.isArray(move.inputs) || move.inputs.length === 0) {
    console.warn(`Move "${move.name}" has no input steps`);
    return false;
  }
  return true;
};

const _flattenMove = (move) => {
  // Ensure all steps have defaults
  for (const step of move.inputs) {
    step.tolerance = step.tolerance || 45;
    step.beatValue = step.beatValue || 1.0;
    if (!step.controller.svgTargets) step.controller.svgTargets = [];
    if (!step.controller.buttons) step.controller.buttons = [];
  }
  return move;
};

export const Data = {
  async load() {
    if (_cache) return _cache;
    try {
      const resp = await fetch('data/moves.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const db = await resp.json();
      // Validate
      for (const move of db.moves) {
        _validateMove(move);
        _flattenMove(move);
      }
      _cache = db;
      State.set('db', db);
      return db;
    } catch (err) {
      console.error('Failed to load moves.json:', err);
      // Try to load from localStorage backup
      try {
        const backup = localStorage.getItem('pspm_moves_backup');
        if (backup) {
          const db = JSON.parse(backup);
          _cache = db;
          State.set('db', db);
          console.warn('Loaded moves from localStorage backup');
          return db;
        }
      } catch (_) { /* ignore */ }
      throw err;
    }
  },

  getMove(id) {
    if (!_cache) return undefined;
    return _cache.moves.find(m => m.id === id) || undefined;
  },

  getMoves(filter) {
    if (!_cache) return [];
    let moves = [..._cache.moves];
    if (filter) {
      if (filter.stars !== undefined) {
        const stars = Array.isArray(filter.stars) ? filter.stars : [filter.stars];
        if (stars.length > 0) {
          moves = moves.filter(m => stars.includes(m.stars));
        }
      }
      if (filter.category && filter.category !== 'all') {
        moves = moves.filter(m => m.category === filter.category);
      }
      if (filter.difficulty && filter.difficulty !== 'all') {
        moves = moves.filter(m => m.difficulty === filter.difficulty);
      }
      if (filter.tags && filter.tags.length > 0) {
        moves = moves.filter(m => filter.tags.some(t => m.tags.includes(t)));
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        moves = moves.filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      if (filter.sortBy) {
        const dir = filter.sortDir === 'desc' ? -1 : 1;
        if (filter.sortBy === 'name') {
          moves.sort((a, b) => a.name.localeCompare(b.name) * dir);
        } else if (filter.sortBy === 'stars') {
          moves.sort((a, b) => (b.stars - a.stars) * dir);
        } else if (filter.sortBy === 'difficulty') {
          const diffOrder = { beginner: 0, intermediate: 1, advanced: 2, expert: 3 };
          moves.sort((a, b) => (diffOrder[a.difficulty] - diffOrder[b.difficulty]) * dir);
        }
      }
    }
    return moves;
  },

  getSequence(id) {
    if (!_cache) return undefined;
    return _cache.sequences.find(s => s.id === id) || undefined;
  },

  getDrill(id) {
    if (!_cache) return undefined;
    return _cache.drills.find(d => d.id === id) || undefined;
  },

  searchMoves(query) {
    return this.getMoves({ search: query });
  },

  getCategories() {
    if (!_cache) return [];
    const cats = new Set();
    for (const m of _cache.moves) cats.add(m.category);
    return [...cats];
  },

  get isLoaded() {
    return _cache !== null;
  },

  _getAll() {
    return _cache;
  }
};
