'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const S = require('./state');
const F = require('./format');
const { loadConfig, saveConfig } = require('./config');

const HELP = `gemini-rpc — Discord Rich Presence for Gemini CLI

  gemini-rpc setup [--client-id ID]   install Gemini CLI hooks (+ save your Discord app ID)
  gemini-rpc uninstall                remove the hooks again
  gemini-rpc start [--foreground]     start the background daemon
  gemini-rpc stop                     stop the daemon (clears the Discord card)
  gemini-rpc status                   live state, tokens, simulated cost
  gemini-rpc stats                    lifetime stats
  gemini-rpc pause | resume           hide / show the Discord card
  gemini-rpc dashboard                open the local dashboard
  gemini-rpc demo                     fake a Gemini CLI session to preview the card
`;

const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function startDetached() {
  const D = require('./daemon');
  if (D.isRunning()) return false;
  fs.mkdirSync(P.tmp, { recursive: true });
  const out = fs.openSync(P.log, 'a');
  spawn(process.execPath, [path.resolve(__dirname, '..', 'bin', 'gemini-rpc.js'), 'start', '--foreground'],
    { detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
  return true;
}

function openUrl(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (_) {}
}

function printStatus() {
  const cfg = loadConfig();
  const { effective } = require('./presence');
  const st = effective(S.readState(), cfg);
  const agg = S.readAgg();
  const D = require('./daemon');
  console.log(`daemon     : ${D.isRunning() ? 'running' : 'stopped'}${fs.existsSync(P.pause) ? ' (card paused)' : ''}`);
  console.log(`discord id : ${/^YOUR/.test(cfg.clientId) ? 'NOT SET — run: gemini-rpc setup --client-id <ID>' : cfg.clientId}`);
  if (!st) { console.log('session    : none (start Gemini CLI)'); return; }
  const t = st.tokens;
  console.log(`session    : ${st.project || '-'} · ${F.prettyModel(st.model)} · ${st.status}${st.tool ? ' (' + st.tool + ')' : ''} · ${F.dur((Date.now() - st.startedAt) / 1000)}`);
  console.log(`tokens     : ${F.tok(t.total)} total (in ${F.tok(t.input)}, out ${F.tok(t.output)}, cached ${F.tok(t.cached)}, thoughts ${F.tok(t.thoughts)})${st.estimated ? '  [estimated]' : ''}`);
  console.log(`prompts    : ${st.prompts} · tool calls ${st.toolCalls} · requests ${st.requests}`);
  const rate = cfg.idrRate;
  console.log(`est. cost  : ${F.usd(st.costUsd)}${rate ? ' (' + F.idr(st.costUsd, rate) + ')' : ''}  [SIMULATION — free tier is not billed]`);
  const day = agg.days[F.today()] || { requests: 0 };
  if (cfg.freeTier.enabled) console.log(`free tier  : ${day.requests}/${cfg.freeTier.dailyLimit} requests today`);
}

function printStats() {
  const cfg = loadConfig(), a = S.readAgg(), t = a.totals;
  console.log(`tokens     : ${F.tok(t.total)} (in ${F.tok(t.input)}, out ${F.tok(t.output)}, cached ${F.tok(t.cached)}, thoughts ${F.tok(t.thoughts)})`);
  console.log(`est. cost  : ${F.usd(t.costUsd)}${cfg.idrRate ? ' (' + F.idr(t.costUsd, cfg.idrRate) + ')' : ''}  [simulation]`);
  console.log(`sessions   : ${t.sessions} · prompts ${t.prompts} · tool calls ${t.toolCalls} · requests ${t.requests}`);
  console.log(`active time: ${F.dur(t.activeSec)} · streak ${S.streak(a)} day(s)`);
}

async function demo() {
  const { handle } = require('./hook');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  startDetached();                       // daemon must NOT inherit demo mode (it reads real stats)
  process.env.GEMINI_RPC_DEMO = '1';     // from here on only this process writes to the demo aggregate
  const sid = 'demo-' + Date.now(), tf = path.join(P.tmp, `demo-${sid}.json`);
  fs.mkdirSync(P.tmp, { recursive: true });
  const msgs = [];
  const base = { session_id: sid, cwd: process.cwd(), transcript_path: tf };
  const ev = (name, extra = {}) => handle({ ...base, hook_event_name: name, ...extra });
  console.log('Running demo session (~25s). Watch your Discord profile / dashboard. Ctrl+C to stop.');
  ev('SessionStart'); await sleep(2000);
  for (let turn = 1; turn <= 3; turn++) {
    ev('BeforeAgent', { prompt: 'demo prompt' }); await sleep(1500);
    ev('BeforeModel', { llm_request: { model: turn === 3 ? 'gemini-2.5-flash' : 'gemini-2.5-pro' } }); await sleep(1500);
    for (const tool of ['read_file', 'run_shell_command']) { ev('BeforeTool', { tool_name: tool }); await sleep(1500); ev('AfterTool', { tool_name: tool }); await sleep(500); }
    msgs.push({ id: 'm' + turn, type: 'gemini', model: turn === 3 ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      tokens: { input: 9000 * turn, output: 700 + 150 * turn, cached: 4000 * turn, thoughts: 400, tool: 0, total: 9000 * turn + 1100 + 150 * turn } });
    fs.writeFileSync(tf, JSON.stringify({ sessionId: sid, messages: msgs }));
    ev('AfterAgent', { prompt: 'demo', prompt_response: 'demo' }); await sleep(3000);
  }
  ev('SessionEnd', { reason: 'exit' });
  try { fs.unlinkSync(tf); } catch (_) {}
  console.log('Demo finished.');
  printStatus();
}

async function main(args) {
  const cmd = args[0];
  switch (cmd) {
    case 'hook': return require('./hook').main();
    case 'setup': {
      const id = flag(args, '--client-id');
      if (id) saveConfig({ clientId: id });
      else if (!fs.existsSync(P.config)) saveConfig({});
      let file;
      try { file = require('./setup').install(); }
      catch (e) { console.error(`Could not edit ${P.geminiSettings}: ${e.message}\nAdd the hooks manually (see README).`); process.exit(1); }
      console.log(`✓ Hooks installed in ${file}`);
      console.log(`✓ Config: ${P.config}`);
      if (!id && /^YOUR/.test(loadConfig().clientId)) console.log('! Set your Discord Application ID:  gemini-rpc setup --client-id <ID>');
      console.log('Restart Gemini CLI. If hooks are off, run /hooks enable-all inside Gemini CLI.');
      return;
    }
    case 'uninstall': {
      console.log(require('./setup').uninstall() ? '✓ Hooks removed' : 'Nothing to remove');
      require('./daemon').stop();
      return;
    }
    case 'start':
      if (args.includes('--foreground')) return require('./daemon').run();
      console.log(startDetached() ? 'daemon started' : 'daemon already running');
      return;
    case 'stop': console.log(require('./daemon').stop() ? 'daemon stopped' : 'daemon not running'); return;
    case 'status': return printStatus();
    case 'stats': return printStats();
    case 'pause': fs.mkdirSync(P.tmp, { recursive: true }); fs.writeFileSync(P.pause, JSON.stringify({ at: Date.now() })); console.log('card paused'); return;
    case 'resume': try { fs.unlinkSync(P.pause); } catch (_) {} console.log('card resumed'); return;
    case 'dashboard': {
      startDetached();
      const url = `http://localhost:${loadConfig().dashboardPort}`;
      console.log(url); setTimeout(() => openUrl(url), 800); setTimeout(() => process.exit(0), 1200);
      return;
    }
    case 'demo': return demo();
    default: console.log(HELP);
  }
}

module.exports = { main };
