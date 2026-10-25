'use strict';
/*
 * SIMULATED pricing. Gemini CLI on the free tier is not billed at all.
 * These are approximate public API list prices (USD per 1M tokens) used only to show
 * "what this session would roughly cost on a paid plan". Edit freely in config.json.
 */
const PRICING = {
  'gemini-3-pro':          { in: 12.00, out: 55.00, cache: 0.25 },
  'gemini-3-flash':        { in: 0.50, out: 3.00,  cache: 0.20 },
  'gemini-2.5-pro':        { in: 2.00, out: 10.00,  cache: 0.15 },
  'gemini-2.5-flash-lite': { in: 2.00, out: 10.00,  cache: 0.15 },
  'gemini-2.5-flash':      { in: 2.00, out: 10.00,  cache: 0.05 },
  'gemini-2.0-flash':      { in: 2.00, out: 10.00,  cache: 0.15 },
  // Claude API list prices (USD per 1M tokens), used when "priceAs" is set (default: "sonnet").
  // Haiku = prompts up to 100K tokens. Fable cache price is an assumption (10% of input), not confirmed.
  'claude-fable-5-1':      { in: 10.00, out: 50.00, cache: 1.00 },
  'claude-opus-5-5':       { in: 4.00,  out: 20.00, cache: 0.20 },
  'claude-sonnet-5-5':     { in: 2.00,  out: 10.00, cache: 0.10 },
  'claude-haiku-5-5':      { in: 0.10,  out: 0.50,  cache: 0.01 },
};
const FALLBACK = 'gemini-2.5-flash';

// "priceAs" (config.json) forces ONE price list for every model, e.g. bill Gemini tokens at Claude prices.
// Use "sonnet" | "opus" | "haiku" | "fable", or "" to go back to per-model Gemini prices.
let _forced = { t: 0, v: null };
function forcedKey() {
  const now = Date.now();
  if (now - _forced.t < 1000) return _forced.v;
  let v = null;
  try { v = require('./config').loadConfig().priceAs || null; } catch (_) {}
  _forced = { t: now, v };
  return v;
}

function priceFor(model, overrides = {}) {
  const table = { ...PRICING, ...overrides };
  const forced = forcedKey();
  if (forced) {
    const k = Object.keys(table).find((key) => key.includes(String(forced).toLowerCase()));
    if (k) return table[k];
  }
  const id = String(model || '').toLowerCase().replace(/^models\//, '');
  const keys = Object.keys(table).sort((a, b) => b.length - a.length); // longest match first (flash-lite before flash)
  const hit = keys.find((k) => id.startsWith(k) || id.includes(k));
  return table[hit || FALLBACK];
}

// tokens: {input, output, cached, thoughts}. cached is treated as a subset of input; thoughts bill as output.
function estimate(tokens, model, overrides) {
  const p = priceFor(model, overrides);
  const input = tokens.input || 0;
  const cached = Math.min(tokens.cached || 0, input);
  const fresh = input - cached;
  const out = (tokens.output || 0) + (tokens.thoughts || 0);
  return (fresh * p.in + cached * p.cache + out * p.out) / 1e6;
}

module.exports = { PRICING, priceFor, estimate };
