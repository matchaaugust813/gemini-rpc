'use strict';
// Minimal, dependency-free Discord Rich Presence client (local IPC, same protocol as discord-rpc).
const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function socketPaths() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    if (process.platform === 'win32') { out.push(`\\\\?\\pipe\\discord-ipc-${i}`); continue; }
    const bases = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, process.env.TMP, process.env.TEMP, '/tmp']
      .filter(Boolean);
    for (const b of bases) {
      out.push(path.join(b, `discord-ipc-${i}`));
      if (b === process.env.XDG_RUNTIME_DIR) {
        out.push(path.join(b, 'app', 'com.discordapp.Discord', `discord-ipc-${i}`)); // flatpak
        out.push(path.join(b, 'snap.discord', `discord-ipc-${i}`));                  // snap
      }
    }
  }
  return [...new Set(out)];
}

class DiscordRPC extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId;
    this.sock = null; this.ready = false; this.connecting = false;
    this.user = null; this.buf = Buffer.alloc(0);
  }

  async connect() {
    this.connecting = true;
    try {
      for (const p of socketPaths()) {
        try { await this._open(p); return; } catch (_) { /* try next socket */ }
      }
      throw new Error('Discord desktop app not reachable (is it running? the browser client has no IPC)');
    } finally { this.connecting = false; }
  }

  _open(p) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(p);
      let settled = false;
      const onReady = () => finish();
      const onRejected = (e) => finish(new Error(`Discord rejected handshake: ${JSON.stringify(e)}`));
      const timer = setTimeout(() => finish(new Error('handshake timeout')), 5000);
      const finish = (err) => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        this.removeListener('ready', onReady); this.removeListener('rejected', onRejected);
        if (err) { try { s.destroy(); } catch (_) {} this.sock = null; reject(err); } else resolve();
      };
      s.once('error', finish);
      s.once('connect', () => {
        this.sock = s; this.buf = Buffer.alloc(0);
        s.removeListener('error', finish);
        s.on('error', () => {});
        s.on('data', (d) => this._data(d));
        s.on('close', () => { this.ready = false; this.sock = null; this.emit('close'); });
        this.once('ready', onReady); this.once('rejected', onRejected);
        this._send(OP.HANDSHAKE, { v: 1, client_id: this.clientId });
      });
    });
  }

  _send(op, payload) {
    if (!this.sock) return;
    const json = Buffer.from(JSON.stringify(payload));
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0); head.writeInt32LE(json.length, 4);
    this.sock.write(Buffer.concat([head, json]));
  }

  _data(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0), len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      let msg = {};
      try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString()); } catch (_) {}
      this.buf = this.buf.slice(8 + len);
      if (op === OP.PING) this._send(OP.PONG, msg);
      else if (op === OP.CLOSE) { this.emit('rejected', msg); try { this.sock.destroy(); } catch (_) {} }
      else if (op === OP.FRAME) {
        if (msg.evt === 'READY') { this.ready = true; this.user = msg.data && msg.data.user; this.emit('ready'); }
        else if (msg.evt === 'ERROR') this.emit('rpc-error', msg.data);
      }
    }
  }

  setActivity(activity) {
    if (!this.ready) return;
    this._send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: crypto.randomUUID() });
  }
  clear() { this.setActivity(undefined); }
  close() { try { this.sock && this.sock.destroy(); } catch (_) {} this.ready = false; }
}

module.exports = { DiscordRPC, socketPaths };
