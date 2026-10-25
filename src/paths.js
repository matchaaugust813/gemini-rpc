'use strict';
const os = require('os');
const path = require('path');

const tmp = process.env.GEMINI_RPC_TMP || path.join(os.tmpdir(), 'gemini-rpc');
const home = process.env.GEMINI_RPC_HOME || path.join(os.homedir(), '.gemini-rpc');

module.exports = {
  tmp,
  home,
  state: path.join(tmp, 'state.json'),
  pause: path.join(tmp, 'pause.json'),
  pid: path.join(tmp, 'daemon.pid'),
  log: path.join(tmp, 'daemon.log'),
  config: path.join(home, 'config.json'),
  // demo mode writes lifetime stats to a separate file so real stats stay clean
  aggregate: () => path.join(home, process.env.GEMINI_RPC_DEMO ? 'aggregate.demo.json' : 'aggregate.json'),
  geminiSettings: path.join(os.homedir(), '.gemini', 'settings.json'),
};
