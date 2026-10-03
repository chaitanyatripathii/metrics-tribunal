// Code-path test for orchestration using a MOCK fetch. This does not test model
// behaviour and its output must never be reported as results.
import assert from 'node:assert/strict';
import { generateDataset } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { createStore, emptyMonths, runTribunal, completedMonthCount } from '../src/llm/orchestrator.js';
import { computeFindings } from '../src/engine/findings.js';

const scored = scoreAllMonths(generateDataset());
let calls = 0;
let failPlan = new Set(); // call numbers that should fail
const mockFetch = async (_url, init) => {
  calls++;
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-sonnet-4-6');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(_url, 'https://api.anthropic.com/v1/messages');
  if (failPlan.has(calls)) return { ok: false, status: 400, json: async () => ({ error: { message: 'mock failure' } }) };
  const u = body.messages[0].content;
  let payload;
  if (u.includes('testimony')) payload = { agreement: 'partial', tension_summary: 'Mock summary.' };
  else {
    const ids = [...u.matchAll(/- (\w+) \(/g)].map((x) => x[1]);
    const pick = body.system.includes('Growth') ? 'activation_rate' : body.system.includes('Finance') ? 'expansion_rate' : ids[1];
    payload = { picked_kpi_id: pick, reasoning: 'Mock reasoning text here.', confidence: 'medium' };
  }
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(payload) + '\n```' }] }) };
};

const store = createStore({ months: emptyMonths(), running: false, runError: null });
// Fail call #5 (month 2, a persona). 400 = non-retryable, so it should stop at month index 1.
failPlan = new Set([5]);
let r = await runTribunal({ store, apiKey: 'test', scored, provider: 'anthropic', model: 'claude-sonnet-4-6', fetchImpl: mockFetch });
assert.equal(r.status, 'stopped'); assert.equal(r.month, 1);
assert.equal(completedMonthCount(store.get().months), 1);
const m1 = store.get().months[1];
const statuses = Object.values(m1.personas).map((p) => p.status).sort();
assert.deepEqual(statuses, ['done', 'done', 'error'], 'other personas in the failed month must be kept');
const callsBefore = calls;
failPlan = new Set();
r = await runTribunal({ store, apiKey: 'test', scored, provider: 'anthropic', model: 'claude-sonnet-4-6', fetchImpl: mockFetch });
assert.equal(r.status, 'complete');
// Resume: 1 failed persona + moderator for month 2, then 4 months x 4 calls.
assert.equal(calls - callsBefore, 2 + 4 * 4);
assert.equal(completedMonthCount(store.get().months), 6);
// Month 2+ prompts include the previous pick.
assert.ok(store.get().months[2].personas.growth.prompt.includes('Last month you picked activation_rate'));
// No user-level data in prompts: prompt must not contain per-user fields.
for (const mo of store.get().months) for (const p of Object.values(mo.personas)) assert.ok(!/featureUsage|signupMonth|churnMonth|upgradedPlan/.test(p.prompt));
const f = computeFindings({ scored, months: store.get().months, completed: 6 });
console.log('findings (mock picks, code-path only):', JSON.stringify(f));
console.log('orchestrator tests passed');

// ---- Gemini request/response shape (mock) ----
{
  const gStore = createStore({ months: emptyMonths(), running: false, runError: null });
  let seen = 0;
  const gFetch = async (url, init) => {
    seen++;
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-test:generateContent$/);
    assert.equal(init.headers['x-goog-api-key'], 'g-test');
    const body = JSON.parse(init.body);
    assert.ok(body.systemInstruction.parts[0].text.length > 0);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    const u = body.contents[0].parts[0].text;
    const payload = u.includes('testimony')
      ? { agreement: 'none', tension_summary: 'Mock.' }
      : { picked_kpi_id: 'wau_mau', reasoning: 'Mock reasoning text here.', confidence: 'low' };
    // Include a "thought" part that must be ignored.
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking...' }, { text: JSON.stringify(payload) }] } }] }) };
  };
  const r = await runTribunal({ store: gStore, apiKey: 'g-test', scored, provider: 'gemini', model: 'gemini-test', fetchImpl: gFetch });
  assert.equal(r.status, 'complete');
  assert.equal(seen, 24);
  assert.deepEqual(gStore.get().modelsUsed, ['gemini:gemini-test']);
  console.log('gemini path tests passed');
}
