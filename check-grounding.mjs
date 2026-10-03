// Grounding rate for a recorded run. Usage: node scripts/check-grounding.mjs [file]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generateDataset } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { computeAgreement, PERSONAS } from '../src/llm/personas.js';
import { validateRecording, recordingToState } from '../src/llm/recording.js';
import { groundingSummary, checkResponse, extractDecimals } from '../src/engine/grounding.js';

const ds = generateDataset(); const scored = scoreAllMonths(ds);
// Unit checks on the matcher.
assert.deepEqual(extractDecimals('pp 0.142, noise ±0.077, 54.2% and Month 4, 1-10'), ['0.142', '0.077', '54.2']);
const p = 'Predictive power: 0.245. Noise ±0.081. Value 3.15 features.';
const ms = scored[2];
assert.equal(checkResponse({ reasoning: 'depth at 0.245 vs noise 0.081', prompt: p, pickedKpiId: 'feature_adoption_depth', monthScore: ms }).grounded, true);
assert.deepEqual(checkResponse({ reasoning: 'dropped from 0.45', prompt: p, pickedKpiId: 'feature_adoption_depth', monthScore: ms }).unmatched, ['0.45']);
assert.equal(checkResponse({ reasoning: 'it is great', prompt: p, pickedKpiId: 'feature_adoption_depth', monthScore: ms }).grounded, false);

const rec = JSON.parse(fs.readFileSync(process.argv[2] ?? 'public/recorded-run.json', 'utf8'));
assert.ok(validateRecording(rec, { scored, seed: ds.seed }).ok);
const st = recordingToState(rec, computeAgreement);
const g = groundingSummary({ months: st.months, scored, personaIds: PERSONAS.map((x) => x.id), completed: 6 });
console.log(`grounded ${g.grounded}/${g.responses} (${(g.groundedRate * 100).toFixed(0)}%) | cite picked KPI ${g.citesPicked}/${g.responses} | numbers unmatched ${g.numbersUnmatched}/${g.numbersQuoted}`);
for (const f of g.failures) console.log(`  M${f.month + 1} ${f.persona}: citesPicked=${f.citesPicked} unmatched=[${f.unmatched}]`);
