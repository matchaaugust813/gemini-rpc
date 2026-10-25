'use strict';

const tok = (n) => {
  n = Math.max(0, Math.round(n || 0));
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};
const usd = (n) => '$' + ((n || 0) < 0.01 ? (n || 0).toFixed(4) : (n || 0).toFixed(2));
const idr = (n, rate) => 'Rp ' + Math.round((n || 0) * rate).toLocaleString('id-ID');
const dur = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
};
const prettyModel = (id) => {
  if (!id) return 'Gemini';
  return String(id).replace(/^models\//, '').split('-')
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
};
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time

module.exports = { tok, usd, idr, dur, prettyModel, today };
