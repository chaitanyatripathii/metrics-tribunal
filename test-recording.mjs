// Round-trip test for recorded runs (mock model output; code-path only).
import assert from 'node:assert/strict';
import { generateDataset, DEFAULT_SEED } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { createStore, emptyMonths, runTribunal } from '../src/llm/orchestrator.js';
import { computeAgreement } from '../src/llm/personas.js';
import { buildRecording, validateRecording, recordingToState, fetchRecording } from '../src/llm/recording.js';
import { computeFindings } from '../src/engine/findings.js';

const ds = generateDataset();
const scored = scoreAllMonths(ds);
const fetchImpl = async (_u, init) => {
  const body = JSON.parse(init.body);
  const u = body.contents[0].parts[0].text;
  const sys = body.systemInstruction.parts[0].text;
  const payload = u.includes('testimony')
    ? { agreement: 'partial', tension_summary: 'Mock.' }
    : { picked_kpi_id: sys.includes('Finance') ? 'expansion_rate' : 'activation_rate', reasoning: 'Mock reasoning text.', confidence: 'medium' };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }) };
};
const store = createStore({ months: emptyMonths(), running: false, runError: null });
assert.throws(() => buildRecording({ state: store.get(), scored, seed: ds.seed }), /complete/);
await runTribunal({ store, apiKey: 'k', scored, provider: 'gemini', model: 'm', fetchImpl });
const rec = JSON.parse(JSON.stringify(buildRecording({ state: store.get(), scored, seed: ds.seed })));
assert.ok(!JSON.stringify(rec).includes('"k"'), 'API key must not appear in a recording');
assert.equal(validateRecording(rec, { scored, seed: ds.seed }).ok, true);
// Replayed state gives identical findings to the live state.
const replay = recordingToState(rec, computeAgreement);
assert.deepEqual(computeFindings({ scored, months: replay.months, completed: 6 }), computeFindings({ scored, months: store.get().months, completed: 6 }));
// Guards.
assert.equal(validateRecording(rec, { scored, seed: DEFAULT_SEED + 1 }).ok, false);
const other = scoreAllMonths(generateDataset(7));
assert.match(validateRecording(rec, { scored: other, seed: ds.seed }).reason, /changed/);
const broken = JSON.parse(JSON.stringify(rec)); delete broken.months[2].personas.growth.result;
assert.equal(validateRecording(broken, { scored, seed: ds.seed }).ok, false);
// Missing file / dev server HTML fallback -> no recording, live mode.
assert.equal((await fetchRecording({ scored, seed: ds.seed, fetchImpl: async () => ({ ok: false }) })).ok, false);
assert.equal((await fetchRecording({ scored, seed: ds.seed, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('html'); } }) })).reason, 'no recording found');
console.log('recording tests passed');
