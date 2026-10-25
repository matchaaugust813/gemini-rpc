'use strict';
/*
 * Entry point for every Gemini CLI hook event. Gemini CLI runs hooks synchronously inside the
 * agent loop, so this must be fast, must NEVER print anything but JSON on stdout, and must
 * always exit 0 (a non-zero/2 exit would block the agent).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const S = require('./state');
const T = require('./tokens');
const { loadConfig } = require('./config');
const { estimate } = require('./pricing');

const ACTIVE = new Set(['thinking', 'working']);

function daemonRunning() {
  try { process.kill(Number(fs.readFileSync(P.pid, 'utf8')), 0); return true; } catch (_) { return false; }
}
function ensureDaemon() {
  if (daemonRunning()) return;
  try {
    fs.mkdirSync(P.tmp, { recursive: true });
    const out = fs.openSync(P.log, 'a');
    const bin = path.resolve(__dirname, '..', 'bin', 'gemini-rpc.js');
    spawn(process.execPath, [bin, 'start', '--foreground'], { detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
  } catch (_) {}
}

// liveOnly = true: called in the middle of a turn (BeforeModel / AfterTool). Only the real
// transcript numbers are used there; the rough character estimate is skipped so nothing is
// counted twice when AfterAgent runs at the end of the turn.
function applyTokens(st, input, cfg, agg, liveOnly = false) {
  const before = { ...st.tokens };
  const costBefore = st.costUsd;
  const parsed = T.fromTranscript(input.transcript_path, cfg.pricing, st.model);

  if (!parsed && liveOnly) return;

  if (parsed) {
    st.tokens = parsed.tokens;
    st.costUsd = parsed.costUsd;
    st.estimated = false;
    if (parsed.model) st.model = parsed.model;
  } else {
    // fallback: rough estimate from the prompt / response text of this turn
    const inT = T.approx(input.prompt), outT = T.approx(input.prompt_response);
    st.tokens = {
      ...st.tokens,
      input: st.tokens.input + inT, output: st.tokens.output + outT,
      total: st.tokens.total + inT + outT,
    };
    st.costUsd += estimate({ input: inT, output: outT }, st.model, cfg.pricing);
    st.estimated = true;
  }

  const d = (k) => Math.max(0, (st.tokens[k] || 0) - (before[k] || 0));
  S.bump(agg, {
    input: d('input'), output: d('output'), cached: d('cached'), thoughts: d('thoughts'),
    total: d('total'), costUsd: Math.max(0, st.costUsd - costBefore),
  });
}

function handle(input) {
  const cfg = loadConfig();
  const ev = input.hook_event_name;
  const now = Date.now();
  const sid = input.session_id || 'unknown';
  const agg = S.readAgg();

  let st = S.readState();
  const fresh = !st || st.sessionId !== sid;
  if (fresh) {
    st = S.newState(sid, input.cwd || process.cwd());
    S.bump(agg, { sessions: 1 });
  }
  if (input.cwd) { st.cwd = input.cwd; st.project = path.basename(input.cwd); }

  // active time: only count gaps while the agent was actually thinking/working
  const gap = (now - (st.updatedAt || now)) / 1000;
  if (!fresh && ACTIVE.has(st.status) && gap > 0 && gap < 300) S.bump(agg, { activeSec: gap });

  st.ended = false;
  switch (ev) {
    case 'SessionStart':
      st.status = 'idle'; st.tool = null;
      ensureDaemon();
      break;
    case 'BeforeAgent':
      st.status = 'thinking'; st.tool = null; st.prompts++;
      S.bump(agg, { prompts: 1 });
      ensureDaemon();
      break;
    case 'BeforeModel':
      st.status = 'thinking';
      st.requests++;
      S.bump(agg, { requests: 1 });          // each model request counts against the free-tier daily quota
      if (input.llm_request && input.llm_request.model) st.model = input.llm_request.model;
      applyTokens(st, input, cfg, agg, true); // live token update in the middle of a turn
      break;
    case 'BeforeTool':
      st.status = 'working'; st.tool = input.tool_name || 'tool'; st.toolCalls++;
      S.bump(agg, { toolCalls: 1 });
      break;
    case 'AfterTool':
      st.status = 'thinking'; st.tool = null;
      applyTokens(st, input, cfg, agg, true); // live token update after every tool call
      break;
    case 'Notification':
      st.status = 'waiting'; st.tool = null;
      break;
    case 'AfterAgent':
      st.status = 'waiting'; st.tool = null;
      applyTokens(st, input, cfg, agg);
      break;
    case 'SessionEnd':
      st.status = 'idle'; st.tool = null; st.ended = true;
      applyTokens(st, input, cfg, agg);
      break;
    default:
      break;
  }
  st.updatedAt = now;
  S.writeState(st);
  S.writeAgg(agg);
  return st;
}

function readStdin(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const t = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => { clearTimeout(t); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(t); resolve(data); });
  });
}

async function main() {
  try {
    const raw = await readStdin();
    handle(raw ? JSON.parse(raw) : {});
  } catch (e) {
    try { fs.mkdirSync(P.tmp, { recursive: true }); fs.appendFileSync(P.log, `[hook] ${e.stack || e}\n`); } catch (_) {}
  }
  process.stdout.write('{}\n', () => process.exit(0));
}

module.exports = { main, handle };
