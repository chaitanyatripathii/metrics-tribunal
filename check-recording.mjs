// Inspect a recorded run: validity, agreement, and wording/number checks.
import fs from 'node:fs';
import { generateDataset } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { computeAgreement, PERSONAS } from '../src/llm/personas.js';
import { validateRecording, recordingToState } from '../src/llm/recording.js';
import { computeFindings } from '../src/engine/findings.js';
const rec = JSON.parse(fs.readFileSync(process.argv[2] ?? 'public/recorded-run.json', 'utf8'));
const ds = generateDataset(); const scored = scoreAllMonths(ds);
const v = validateRecording(rec, { scored, seed: ds.seed });
console.log('valid:', v.ok, v.reason ?? '', '| model:', rec.modelsUsed, '| promptVersion:', rec.promptVersion);
if (!v.ok) process.exit(1);
const st = recordingToState(rec, computeAgreement);
const f = computeFindings({ scored, months: st.months, completed: 6 });
console.log('disagreement:', f.disagreementPct, `(${f.disagreementMonths}/6)`, '| avgDecayDrop:', f.avgDecayDrop, '| moderatorMismatches:', f.moderatorMismatches);
const bad = /statistically significant|significan|\bcaus|\bdrives?\b|\breduc(e|es|ing)\b/i;
st.months.forEach((mo, m) => {
  const picks = PERSONAS.map((p) => `${p.id[0]}:${mo.personas[p.id].result.picked_kpi_id}`).join(' ');
  console.log(`M${m + 1} ${mo.agreement.padEnd(7)} ${picks}`);
  const texts = [...PERSONAS.map((p) => [p.id, mo.personas[p.id].result.reasoning]), ['moderator', mo.moderator.result.tension_summary]];
  for (const [who, t] of texts) {
    const hit = t.match(bad); if (hit) console.log(`   WORDING ${who}: "...${t.slice(Math.max(0, hit.index - 50), hit.index + 40)}..."`);
    // numbers quoted vs numbers present in that month's prompt
    const prompt = who === 'moderator' ? mo.moderator.prompt : mo.personas[who].prompt;
    const nums = [...t.matchAll(/\d+\.\d+/g)].map((x) => x[0]);
    const missing = nums.filter((n) => !prompt.includes(n) && !prompt.includes(n.replace(/0+$/, '')) );
    if (missing.length) console.log(`   UNMATCHED NUMBERS ${who}: ${missing.join(', ')}`);
  }
});
