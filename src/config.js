'use strict';
const fs = require('fs');
const P = require('./paths');

const DEFAULTS = {
  // Create an app at https://discord.com/developers/applications and paste its Application ID here.
  clientId: '1563461402595958846',
  dashboardPort: 4789,
  idleAfterSec: 300,          // thinking/working with no events for this long => shown as idle
  showProject: true,
  showCost: true,             // cost is a SIMULATION (see src/pricing.js)
  priceAs: 'sonnet',          // bill every model at Claude prices: sonnet | opus | haiku | fable  ("" = use the Gemini table)
  idrRate: 16500,             // 1 USD in IDR for the dashboard; set 0 to hide IDR
  freeTier: { enabled: true, dailyLimit: 1000, perMinuteLimit: 60 },
  largeImageKey: 'gemini',    // upload art assets with these names in your Discord app
  smallImages: { working: 'working', thinking: 'thinking', waiting: 'waiting', idle: 'idle' },
  pricing: {},                // override per-model prices, e.g. {"gemini-2.5-pro":{"in":1.25,"out":10,"cache":0.31}}
};

function loadConfig() {
  let user = {};
  try { user = JSON.parse(fs.readFileSync(P.config, 'utf8')); } catch (_) {}
  return {
    ...DEFAULTS, ...user,
    freeTier: { ...DEFAULTS.freeTier, ...(user.freeTier || {}) },
    smallImages: { ...DEFAULTS.smallImages, ...(user.smallImages || {}) },
    pricing: { ...(user.pricing || {}) },
  };
}

function saveConfig(patch) {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(P.config, 'utf8')); } catch (_) {}
  fs.mkdirSync(P.home, { recursive: true });
  fs.writeFileSync(P.config, JSON.stringify({ ...cur, ...patch }, null, 2));
}

module.exports = { DEFAULTS, loadConfig, saveConfig };
