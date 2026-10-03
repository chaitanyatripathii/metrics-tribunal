import { generateDataset } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { detectDecay } from '../src/engine/decay.js';
const seeds = [20260924, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const tally = {};
for (const s of seeds) {
  const d = detectDecay(scoreAllMonths(generateDataset(s)));
  const line = Object.entries(d).map(([id, v]) => { const key = `${id}@${v.decayed ? 'M' + (v.decayMonth + 1) : '-'}`; tally[key] = (tally[key] || 0) + 1; return `${id.slice(0, 10)}:${v.decayed ? 'M' + (v.decayMonth + 1) : '-'}`; }).join(' ');
  console.log(String(s).padEnd(9), line);
}
console.log(Object.entries(tally).sort().map(([k, v]) => `${k}=${v}`).join('\n'));
