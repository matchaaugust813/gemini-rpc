'use strict';
const F = require('./format');

const LABEL = { thinking: 'Thinking…', working: 'Working', waiting: 'Waiting on you', idle: 'Idle' };

// Order in which the card rotates. Override with "pages": ["live","today",...] in config.json.
const DEFAULT_ORDER = ['live', 'today', 'lifetime', 'session', 'tokens', 'cache', 'cost', 'quota', 'streak'];

// Large image per state. Priority: largeImages[status] > gifBaseUrl/<status>.gif > largeImageKey (Discord art asset)
function largeImage(st, cfg) {
  const own = cfg.largeImages && cfg.largeImages[st.status];
  if (own) return own;
  if (cfg.gifBaseUrl) return `${String(cfg.gifBaseUrl).replace(/\/+$/, '')}/${st.status}.gif`;
  return cfg.largeImageKey;
}

function statusLabel(st) {
  return st.status === 'working' && st.tool ? `Running ${st.tool}` : LABEL[st.status] || 'Idle';
}

function buildPages(st, agg, cfg, streak) {
  const label = statusLabel(st);
  const t = st.tokens || {};
  const T = agg.totals;
  const day = { total: 0, costUsd: 0, requests: 0, prompts: 0, toolCalls: 0, activeSec: 0, ...(agg.days[F.today()] || {}) };
  const tl = cfg.tokenLabel === undefined ? 'tok' : cfg.tokenLabel;
  const sl = cfg.simLabel === undefined ? 'sim' : cfg.simLabel;
  const tk = (n) => `${F.tok(n)}${tl ? ' ' + tl : ''}`;
  const sim = sl ? ` (${sl})` : '';
  const model = F.prettyModel(st.model);

  const PAGES = {
    // what is happening right now
    live: () => ({
      details: `${model}${cfg.showProject && st.project ? ' · ' + st.project : ''}`,
      state: `${label} · ${tk(t.total || 0)}${cfg.showCost ? ` · ≈${F.usd(st.costUsd)}${sim}` : ''}`,
    }),
    today: () => ({
      details: `Today · ${tk(day.total)}`,
      state: `${day.requests} req · ${day.prompts || 0} prompts · ${F.dur(day.activeSec)} active`,
    }),
    lifetime: () => ({
      details: `Lifetime · ${tk(T.total)}`,
      state: `${T.sessions} sessions · ${T.prompts} prompts · ${F.dur(T.activeSec)}`,
    }),
    session: () => ({
      details: `This session · ${F.dur((Date.now() - st.startedAt) / 1000)}`,
      state: `${st.prompts} prompts · ${st.toolCalls} tool calls · ${st.requests} req`,
    }),
    tokens: () => ({
      details: `In ${F.tok(t.input)} · Out ${F.tok(t.output)}`,
      state: `Cached ${F.tok(t.cached)} · Thoughts ${F.tok(t.thoughts)}`,
    }),
    cache: () => {
      if (!(t.input > 0)) return null;
      const fresh = Math.max(0, t.input - (t.cached || 0));
      const pct = Math.round(((t.cached || 0) / t.input) * 100);
      return { details: `${F.tok(fresh)} fresh tokens`, state: `${pct}% from cache` };
    },
    cost: () => {
      if (!cfg.showCost) return null;
      return {
        details: `Cost · ${F.usd(st.costUsd)} this session`,
        state: `${F.usd(day.costUsd)} today · ${F.usd(T.costUsd)} all-time${sim}`,
      };
    },
    quota: () => {
      if (!(cfg.freeTier.enabled && cfg.showQuota !== false)) return null;
      const lim = cfg.freeTier.dailyLimit;
      return {
        details: `Free tier · ${day.requests}/${lim} req`,
        state: `${Math.max(0, lim - day.requests)} requests left today`,
      };
    },
    streak: () => {
      if (!(streak > 1)) return null;
      return { details: `${streak}-day streak`, state: `${F.dur(T.activeSec)} active lifetime` };
    },
  };

  return { PAGES, label };
}

// pageIdx: any integer, it wraps around the enabled pages (the daemon passes a time-based counter)
function buildActivity(st, agg, cfg, streak, pageIdx = 0) {
  const { PAGES, label } = buildPages(st, agg, cfg, streak);

  let page;
  if (cfg.rotate === false) {
    page = PAGES.live();
  } else {
    const order = Array.isArray(cfg.pages) && cfg.pages.length ? cfg.pages : DEFAULT_ORDER;
    const list = order.map((id) => (PAGES[id] ? PAGES[id]() : null)).filter(Boolean);
    page = list.length ? list[((pageIdx % list.length) + list.length) % list.length] : PAGES.live();
  }

  const tl = cfg.tokenLabel === undefined ? 'tok' : cfg.tokenLabel;
  const day = agg.days[F.today()] || { requests: 0 };
  const quota = cfg.freeTier.enabled && cfg.showQuota !== false ? `Free tier ${day.requests}/${cfg.freeTier.dailyLimit} req today · ` : '';
  const life = `${quota}Lifetime ${F.tok(agg.totals.total)}${tl ? ' ' + tl : ''} · ${F.dur(agg.totals.activeSec)}${streak > 1 ? ` · ${streak}d streak` : ''}`;
  const showSmall = cfg.showSmallImage !== false;

  return {
    details: page.details.slice(0, 120).padEnd(2),
    state: page.state.slice(0, 120).padEnd(2),
    timestamps: { start: Math.floor(st.startedAt / 1000) },
    assets: {
      large_image: largeImage(st, cfg),
      large_text: life.slice(0, 120),
      small_image: showSmall ? (cfg.smallImages[st.status] || st.status) : undefined,
      small_text: showSmall ? label.slice(0, 120) : undefined,
    },
    instance: false,
  };
}

function effective(st, cfg, now = Date.now()) {
  if (!st) return null;
  const age = (now - st.updatedAt) / 1000;
  if (st.ended || age > 2 * 3600) return null;
  const copy = { ...st };
  if ((st.status === 'thinking' || st.status === 'working') && age > cfg.idleAfterSec) { copy.status = 'idle'; copy.tool = null; }
  if (st.status === 'waiting' && age > 30 * 60) { copy.status = 'idle'; }
  return copy;
}

module.exports = { buildActivity, effective, LABEL, DEFAULT_ORDER };
