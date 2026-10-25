'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./paths');

const NAME = 'gemini-rpc';
// AfterModel is deliberately skipped: it fires per streamed chunk and would spawn a process each time.
const EVENTS = ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeModel', 'BeforeTool', 'AfterTool', 'Notification'];

function stripComments(s) {
  return s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '');
}
function readSettings() {
  if (!fs.existsSync(P.geminiSettings)) return {};
  const raw = fs.readFileSync(P.geminiSettings, 'utf8');
  try { return JSON.parse(raw); } catch (_) {}
  return JSON.parse(stripComments(raw).replace(/,(\s*[}\]])/g, '$1')); // throws if still invalid
}
function writeSettings(obj) {
  fs.mkdirSync(path.dirname(P.geminiSettings), { recursive: true });
  const bak = P.geminiSettings + '.gemini-rpc.bak';
  if (fs.existsSync(P.geminiSettings) && !fs.existsSync(bak)) fs.copyFileSync(P.geminiSettings, bak);
  fs.writeFileSync(P.geminiSettings, JSON.stringify(obj, null, 2) + '\n');
}
const isOurs = (group) => (group.hooks || []).some((h) => h.name === NAME);

function hookCommand() {
  const bin = path.resolve(__dirname, '..', 'bin', 'gemini-rpc.js');
  // Windows: Gemini CLI runs hooks through PowerShell, which rejects a quoted executable at the
  // start of a command ("Unexpected token"). A bare `node` + quoted argument works in both
  // PowerShell and cmd (Gemini CLI itself needs node on PATH). POSIX keeps the absolute path (nvm-safe).
  if (process.platform === 'win32') return `node "${bin}" hook`;
  return `"${process.execPath}" "${bin}" hook`;
}

function install() {
  const settings = readSettings();
  settings.hooks = settings.hooks || {};
  for (const ev of EVENTS) {
    const groups = (settings.hooks[ev] || []).filter((g) => !isOurs(g));
    groups.push({ matcher: '*', hooks: [{ name: NAME, type: 'command', command: hookCommand(), timeout: 5000, description: 'Discord Rich Presence' }] });
    settings.hooks[ev] = groups;
  }
  writeSettings(settings);
  return P.geminiSettings;
}

function uninstall() {
  if (!fs.existsSync(P.geminiSettings)) return false;
  const settings = readSettings();
  if (!settings.hooks) return false;
  for (const ev of Object.keys(settings.hooks)) {
    settings.hooks[ev] = (settings.hooks[ev] || []).filter((g) => !isOurs(g));
    if (!settings.hooks[ev].length) delete settings.hooks[ev];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  writeSettings(settings);
  return true;
}

module.exports = { install, uninstall, hookCommand, EVENTS };
