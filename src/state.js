'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { today } = require('./format');

function readJSON(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file); // atomic swap so the daemon never reads a half-written file
}

const readState = () => readJSON(P.state);
const writeState = (s) => writeJSON(P.state, s);

const emptyTokens = () => ({ input: 0, output: 0, cached: 0, thoughts: 0, tool: 0, total: 0 });

function newState(sessionId, cwd) {
  const now = Date.now();
  return {
    sessionId, cwd, project: cwd ? path.basename(cwd) : '',
    model: null, status: 'idle', tool: null, ended: false,
    startedAt: now, updatedAt: now,
    prompts: 0, toolCalls: 0, requests: 0,
    tokens: emptyTokens(), costUsd: 0, estimated: false,
  };
}

function emptyAgg() {
  return {
    firstSeen: Date.now(),
    totals: { input: 0, output: 0, cached: 0, thoughts: 0, total: 0, costUsd: 0, prompts: 0, toolCalls: 0, requests: 0, sessions: 0, activeSec: 0 },
    days: {},
  };
}
const readAgg = () => readJSON(P.aggregate(), null) || emptyAgg();
const writeAgg = (a) => writeJSON(P.aggregate(), a);

// add a delta object ({input, output, total, costUsd, prompts, ...}) to lifetime totals and today's bucket
function bump(agg, delta) {
  const day = (agg.days[today()] ||= { total: 0, costUsd: 0, requests: 0, prompts: 0, toolCalls: 0, activeSec: 0 });
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    if (k in agg.totals) agg.totals[k] += v;
    if (k in day) day[k] += v;
  }
  // keep ~90 days of history
  const keys = Object.keys(agg.days).sort();
  while (keys.length > 90) delete agg.days[keys.shift()];
}

function streak(agg) {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const key = d.toLocaleDateString('sv-SE');
    const day = agg.days[key];
    if (day && (day.requests > 0 || day.activeSec > 0)) n++;
    else if (i > 0) break; // today may still be empty
    d.setDate(d.getDate() - 1);
  }
  return n;
}

module.exports = { readJSON, writeJSON, readState, writeState, newState, emptyTokens, readAgg, writeAgg, bump, streak };
