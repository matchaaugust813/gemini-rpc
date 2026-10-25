'use strict';
const fs = require('fs');
const http = require('http');
const P = require('./paths');
const S = require('./state');
const F = require('./format');
const { loadConfig } = require('./config');
const { effective } = require('./presence');

function snapshot(discord) {
  const cfg = loadConfig();
  const agg = S.readAgg();
  const st = effective(S.readState(), cfg);
  const days = [];
  const d = new Date();
  for (let i = 13; i >= 0; i--) {
    const x = new Date(d); x.setDate(d.getDate() - i);
    const key = x.toLocaleDateString('sv-SE');
    days.push({ date: key, ...(agg.days[key] || { total: 0, costUsd: 0, requests: 0 }) });
  }
  return {
    state: st, aggregate: agg, today: agg.days[F.today()] || { total: 0, costUsd: 0, requests: 0, activeSec: 0 },
    days, streak: S.streak(agg), paused: fs.existsSync(P.pause), discord,
    config: { freeTier: cfg.freeTier, idrRate: cfg.idrRate, showCost: cfg.showCost },
  };
}

function startDashboard(cfg, getDiscord) {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(snapshot(getDiscord())));
    }
    if (req.method === 'POST' && (url === '/api/pause' || url === '/api/resume')) {
      if (url === '/api/pause') { fs.mkdirSync(P.tmp, { recursive: true }); fs.writeFileSync(P.pause, JSON.stringify({ at: Date.now() })); }
      else { try { fs.unlinkSync(P.pause); } catch (_) {} }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  server.on('error', (e) => console.log('dashboard:', e.message));
  server.listen(cfg.dashboardPort, '127.0.0.1'); // localhost only
  return server;
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>gemini-rpc</title>
<style>
:root{--bg:#0f1117;--card:#181b24;--line:#272b38;--tx:#e8eaf0;--mut:#8b91a3;--ac:#7aa2ff;--ac2:#b58cff;--ok:#4ade80;--warn:#fbbf24}
@media(prefers-color-scheme:light){:root{--bg:#f5f6fa;--card:#fff;--line:#e2e5ee;--tx:#171923;--mut:#667085;--ac:#3b6cf0;--ac2:#8b5cf6;--ok:#16a34a;--warn:#d97706}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--tx);padding:20px}
.wrap{max-width:980px;margin:0 auto}h1{font-size:18px;margin:0 0 4px}.sub{color:var(--mut);margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.04em}.big{font-size:24px;font-weight:600;margin-top:4px}
.row{display:flex;justify-content:space-between;gap:8px;margin-top:6px;color:var(--mut)}.row b{color:var(--tx);font-weight:500}
.pill{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;border:1px solid var(--line)}
.working{color:var(--ok)}.thinking{color:var(--ac)}.waiting{color:var(--warn)}.idle{color:var(--mut)}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--ac),var(--ac2))}
.chart{display:flex;align-items:flex-end;gap:6px;height:90px;margin-top:10px}.chart div{flex:1;background:linear-gradient(var(--ac2),var(--ac));border-radius:4px 4px 0 0;min-height:2px;opacity:.85}
.note{color:var(--mut);font-size:12px;margin-top:10px}button{background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
.sim{color:var(--warn);font-size:11px;border:1px solid var(--warn);border-radius:6px;padding:0 6px;margin-left:6px}
</style></head><body><div class="wrap">
<div style="display:flex;justify-content:space-between;align-items:center"><div><h1>gemini-rpc</h1><div class="sub" id="sub">connecting…</div></div><button id="pz"></button></div>
<div class="grid">
<div class="card"><div class="lbl">Status</div><div class="big"><span id="status" class="pill idle">idle</span></div><div class="row"><span>Model</span><b id="model">—</b></div><div class="row"><span>Project</span><b id="proj">—</b></div><div class="row"><span>Session</span><b id="dur">—</b></div></div>
<div class="card"><div class="lbl">Session tokens</div><div class="big" id="tt">0</div><div class="row"><span>Input</span><b id="ti">0</b></div><div class="row"><span>Output</span><b id="to">0</b></div><div class="row"><span>Cached / Thoughts</span><b id="tc">0 / 0</b></div><div class="row"><span>Prompts / Tools</span><b id="pt">0 / 0</b></div></div>
<div class="card"><div class="lbl">Estimated cost<span class="sim">SIMULATION</span></div><div class="big" id="cost">$0.00</div><div class="row"><span>In IDR</span><b id="costidr">—</b></div><div class="row"><span>Today</span><b id="costday">—</b></div><div class="row"><span>Lifetime</span><b id="costlife">—</b></div><div class="note">Free tier is not billed. This is what the same usage would roughly cost at paid API list prices.</div></div>
<div class="card"><div class="lbl">Free tier quota (today)</div><div class="big"><span id="q">0</span> <span style="font-size:14px;color:var(--mut)">/ <span id="ql">1000</span> req</span></div><div class="bar"><i id="qb" style="width:0"></i></div><div class="note" id="qn"></div></div>
</div>
<div class="grid">
<div class="card"><div class="lbl">Lifetime</div><div class="big" id="lt">0</div><div class="row"><span>Active time</span><b id="la">—</b></div><div class="row"><span>Sessions</span><b id="ls">0</b></div><div class="row"><span>Requests</span><b id="lr">0</b></div><div class="row"><span>Streak</span><b id="lk">0 days</b></div></div>
<div class="card" style="grid-column:span 2"><div class="lbl">Tokens, last 14 days</div><div class="chart" id="chart"></div></div>
</div></div>
<script>
const $=id=>document.getElementById(id);
const tok=n=>{n=Math.round(n||0);return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':''+n};
const usd=n=>'$'+((n||0)<0.01?(n||0).toFixed(4):(n||0).toFixed(2));
const dur=s=>{s=Math.round(s||0);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+'h '+m+'m':m?m+'m':s+'s'};
const pretty=m=>m?m.replace(/^models\\//,'').split('-').map(p=>/^\\d/.test(p)?p:p[0].toUpperCase()+p.slice(1)).join(' '):'—';
let paused=false;
$('pz').onclick=()=>fetch(paused?'/api/resume':'/api/pause',{method:'POST'}).then(load);
async function load(){
 let d;try{d=await (await fetch('/api/state')).json()}catch(e){$('sub').textContent='daemon not reachable';return}
 const s=d.state,a=d.aggregate,t=a.totals,c=d.config;paused=d.paused;
 $('pz').textContent=paused?'Resume Discord card':'Pause Discord card';
 $('sub').textContent=(d.discord.connected?'Discord: connected'+(d.discord.user?' as '+d.discord.user:''):d.discord.configured?'Discord: waiting for the desktop app':'Discord: no clientId set (local only)')+(paused?' · card paused':'');
 const st=s?s.status:'idle';$('status').className='pill '+st;$('status').textContent=st==='working'&&s.tool?'working · '+s.tool:st;
 $('model').textContent=s?pretty(s.model):'—';$('proj').textContent=s?s.project||'—':'—';$('dur').textContent=s?dur((Date.now()-s.startedAt)/1000):'—';
 const k=s?s.tokens:{};$('tt').textContent=tok(k.total)+(s&&s.estimated?' ~':'');$('ti').textContent=tok(k.input);$('to').textContent=tok(k.output);
 $('tc').textContent=tok(k.cached)+' / '+tok(k.thoughts);$('pt').textContent=(s?s.prompts:0)+' / '+(s?s.toolCalls:0);
 const cost=s?s.costUsd:0;$('cost').textContent=usd(cost);$('costidr').textContent=c.idrRate?'Rp '+Math.round(cost*c.idrRate).toLocaleString('id-ID'):'—';
 $('costday').textContent=usd(d.today.costUsd);$('costlife').textContent=usd(t.costUsd);
 const lim=c.freeTier.dailyLimit,used=d.today.requests||0;$('q').textContent=used;$('ql').textContent=lim;$('qb').style.width=Math.min(100,used/lim*100)+'%';
 $('qn').textContent=c.freeTier.enabled?Math.max(0,lim-used)+' requests left · limit '+c.freeTier.perMinuteLimit+'/min':'quota tracking off';
 $('lt').textContent=tok(t.total)+' tokens';$('la').textContent=dur(t.activeSec);$('ls').textContent=t.sessions;$('lr').textContent=t.requests;$('lk').textContent=d.streak+' day'+(d.streak===1?'':'s');
 const max=Math.max(1,...d.days.map(x=>x.total||0));
 $('chart').innerHTML=d.days.map(x=>'<div title="'+x.date+': '+tok(x.total)+' tokens, '+x.requests+' req" style="height:'+Math.max(2,(x.total||0)/max*100)+'%"></div>').join('');
}
load();setInterval(load,1500);
</script></body></html>`;

module.exports = { startDashboard, snapshot };
