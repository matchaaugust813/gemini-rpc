'use strict';
const fs = require('fs');
const { estimate } = require('./pricing');

/*
 * Reads Gemini CLI's session transcript (the `transcript_path` every hook receives) and sums
 * per-message token usage. Message shape (Gemini CLI chat recording):
 *   { type: 'gemini', model, tokens: { input, output, cached, thoughts, tool, total } }
 * Also tolerates raw `usageMetadata` fields and JSONL transcripts. Returns null when no
 * token info is found so the caller can fall back to a character-based estimate.
 */
function fromTranscript(file, pricingOverrides, fallbackModel) {
  if (!file) return null;
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }

  let msgs = [];
  try {
    const j = JSON.parse(raw);
    msgs = Array.isArray(j) ? j : (j.messages || []);
  } catch (_) {
    const byId = new Map();
    raw.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try { const o = JSON.parse(line); if (o.tokens || o.usageMetadata) byId.set(o.id || `l${i}`, o); } catch (_) {}
    });
    msgs = [...byId.values()];
  }

  const sum = { input: 0, output: 0, cached: 0, thoughts: 0, tool: 0, total: 0 };
  let costUsd = 0, model = null, found = false;
  for (const m of msgs) {
    const t = m.tokens || {}, u = m.usageMetadata || {};
    if (!m.tokens && !m.usageMetadata) continue;
    const input = t.input ?? u.promptTokenCount ?? 0;
    const output = t.output ?? u.candidatesTokenCount ?? 0;
    const cached = t.cached ?? u.cachedContentTokenCount ?? 0;
    const thoughts = t.thoughts ?? u.thoughtsTokenCount ?? 0;
    const tool = t.tool ?? u.toolUsePromptTokenCount ?? 0;
    const total = t.total ?? u.totalTokenCount ?? (input + output + thoughts + tool);
    found = true;
    sum.input += input; sum.output += output; sum.cached += cached;
    sum.thoughts += thoughts; sum.tool += tool; sum.total += total;
    if (m.model) model = m.model;
    costUsd += estimate({ input: input + tool, output, cached, thoughts }, m.model || fallbackModel, pricingOverrides);
  }
  return found ? { tokens: sum, costUsd, model } : null;
}

// ~4 characters per token: only used when the transcript has no usage data
const approx = (text) => Math.ceil(String(text || '').length / 4);

module.exports = { fromTranscript, approx };
