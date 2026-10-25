'use strict';
const fs = require('fs');
const P = require('./paths');
const S = require('./state');
const { loadConfig } = require('./config');
const { DiscordRPC } = require('./discord');
const { buildActivity, effective } = require('./presence');
const { startDashboard } = require('./dashboard');

function isRunning() {
  try { process.kill(Number(fs.readFileSync(P.pid, 'utf8')), 0); return true; } catch (_) { return false; }
}
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function run() {
  fs.mkdirSync(P.tmp, { recursive: true });
  if (isRunning()) { console.log('gemini-rpc daemon already running'); return; }
  fs.writeFileSync(P.pid, String(process.pid));

  const cfg = loadConfig();
  const configured = cfg.clientId && !/^YOUR/.test(cfg.clientId);
  const rpc = configured ? new DiscordRPC(cfg.clientId) : null;
  if (!configured) log('No Discord clientId set — running local-only (dashboard works). Run: gemini-rpc setup --client-id <ID>');

  let lastSig = '', lastSent = 0, cleared = true, nextTry = 0, backoff = 5000, shuttingDown = false;
  // The elapsed timer on the card is pinned here: it only restarts after the card has been cleared
  // (session ended / paused / stale), not every time the session state is recreated.
  let shownStart = 0;
  if (rpc) {
    rpc.on('ready', () => { log('Discord connected as', rpc.user && rpc.user.username); backoff = 5000; lastSig = ''; });
    rpc.on('close', () => log('Discord connection closed'));
    rpc.on('rpc-error', (e) => log('Discord error', JSON.stringify(e)));
  }

  const dash = startDashboard(cfg, () => ({
    configured, connected: !!(rpc && rpc.ready), user: rpc && rpc.user ? rpc.user.username : null,
  }));

  async function tick() {
    if (shuttingDown) return;
    if (rpc && !rpc.ready && !rpc.connecting && Date.now() >= nextTry) {
      try { await rpc.connect(); } catch (e) { nextTry = Date.now() + backoff; backoff = Math.min(backoff * 2, 30000); }
    }
    if (!rpc || !rpc.ready) return;

    const c = loadConfig();
    const paused = fs.existsSync(P.pause);
    const st = paused ? null : effective(S.readState(), c);
    if (!st) {
      if (!cleared) { rpc.clear(); cleared = true; lastSig = ''; }
      shownStart = 0;
      return;
    }
    if (!shownStart) shownStart = st.startedAt || Date.now();
    const agg = S.readAgg();

    // Rotating card: the page changes every rotateSec seconds (Discord needs >= 15s between updates)
    const rotateSec = Math.max(15, Number(c.rotateSec) || 20);
    const pageIdx = c.rotate === false ? 0 : Math.floor(Date.now() / (rotateSec * 1000));
    const act = buildActivity(st, agg, c, S.streak(agg), pageIdx);
    act.timestamps = { start: Math.floor(shownStart / 1000) };

    const sig = JSON.stringify([act.details, act.state, act.assets]);
    // Discord allows ~5 presence updates / 20s; stay well under it
    if (sig !== lastSig && Date.now() - lastSent >= 15000) {
      rpc.setActivity(act); lastSig = sig; lastSent = Date.now(); cleared = false;
    }
  }
  const timer = setInterval(() => tick().catch((e) => log('tick', e.message)), 1500);

  async function shutdown() {
    if (shuttingDown) return; shuttingDown = true;
    clearInterval(timer);
    try { if (rpc && rpc.ready) { rpc.clear(); await new Promise((r) => setTimeout(r, 300)); } } catch (_) {}
    try { rpc && rpc.close(); dash && dash.close(); } catch (_) {}
    try { fs.unlinkSync(P.pid); } catch (_) {}
    process.exit(0);
  }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  log('gemini-rpc daemon started, pid', process.pid);
}

function stop() {
  try {
    const pid = Number(fs.readFileSync(P.pid, 'utf8'));
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (_) { return false; }
}

module.exports = { run, stop, isRunning };
