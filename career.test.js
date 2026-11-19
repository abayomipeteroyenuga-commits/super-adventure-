'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function loadCareer(seed) {
  const data = new Map();
  if (seed) data.set('ethan.superkingdom.career.v1', JSON.stringify(seed));
  const events = [];

  global.localStorage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };
  global.window = {
    dispatchEvent(event) { events.push(event); return true; }
  };

  const modulePath = require.resolve('./career.js');
  delete require.cache[modulePath];
  require(modulePath);

  return {
    career: global.window.SuperKingdomCareer,
    events,
    data,
    cleanup() {
      delete global.window;
      delete global.localStorage;
      delete global.CustomEvent;
      delete require.cache[modulePath];
    }
  };
}

test('medal thresholds return the intended ranks', () => {
  const h = loadCareer();
  try {
    assert.equal(h.career.medalFor(60, 5000), 'platinum');
    assert.equal(h.career.medalFor(100, 3000), 'gold');
    assert.equal(h.career.medalFor(140, 500), 'silver');
    assert.equal(h.career.medalFor(170, 500), 'bronze');
  } finally { h.cleanup(); }
});

test('time attack stores a separate best time and platinum medal', () => {
  const h = loadCareer();
  try {
    h.career.recordEvent('worldComplete', { world: 4, mode: 'time-attack', seconds: 60, score: 5000 });
    const state = h.career.status();
    assert.deepEqual(state.completedWorlds, [4]);
    assert.equal(state.stats.timeTrials, 1);
    assert.equal(state.worldRecords[4].modes['time-attack'].bestMedal, 'platinum');
    assert.equal(state.worldRecords[4].modes['time-attack'].bestTime, 60);
    assert.equal(state.medalTotals.platinum, 1);
  } finally { h.cleanup(); }
});

test('extreme retries improve personal bests without overwriting other modes', () => {
  const h = loadCareer();
  try {
    h.career.recordEvent('worldComplete', { world: 7, mode: 'extreme', seconds: 100, score: 3000 });
    h.career.recordEvent('worldComplete', { world: 7, mode: 'extreme', seconds: 90, score: 3200 });
    h.career.recordEvent('worldComplete', { world: 7, mode: 'replay', seconds: 130, score: 1800 });
    const record = h.career.status().worldRecords[7];
    assert.equal(record.modes.extreme.clears, 2);
    assert.equal(record.modes.extreme.bestTime, 90);
    assert.equal(record.modes.extreme.bestScore, 3200);
    assert.equal(record.modes.extreme.bestMedal, 'gold');
    assert.equal(record.modes.replay.clears, 1);
    assert.equal(h.career.status().stats.extremeClears, 2);
  } finally { h.cleanup(); }
});

test('assist mode records completion but never awards a medal', () => {
  const h = loadCareer();
  try {
    h.career.recordEvent('worldComplete', { world: 3, mode: 'assist', seconds: 65, score: 9000 });
    const state = h.career.status();
    assert.equal(state.completedWorlds.includes(3), true);
    assert.equal(state.worldRecords[3].modes.assist.bestMedal, 'none');
    assert.equal(state.medalTotals.platinum, 0);
  } finally { h.cleanup(); }
});

test('older career records migrate into Story Mode personal bests', () => {
  const h = loadCareer({
    stats: { worldCompletions: 2 },
    completedWorlds: [1, 2],
    worldRecords: {
      1: { bestScore: 3000, timesCompleted: 2, bestTime: 90, lastCompletedAt: 1 }
    }
  });
  try {
    const record = h.career.status().worldRecords[1];
    assert.equal(record.modes.story.bestScore, 3000);
    assert.equal(record.modes.story.bestTime, 90);
    assert.equal(record.modes.story.bestMedal, 'gold');
  } finally { h.cleanup(); }
});
