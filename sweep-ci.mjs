// Tier 2.1 evaluation: false-flag rate before/after the bootstrap check, same 10 seeds
// as scripts/sweep.mjs. Ground truth: the only injected decay is Activation Rate after
// the Month-4 pricing change. A "hit" = activation_rate flagged at M4 or M5. Any other
// flag (another KPI, or activation at another month) counts as a false flag.
import { generateDataset } from '../src/engine/generator.js';
import { scoreAllMonths } from '../src/engine/kpis.js';
import { detectDecay } from '../src/engine/decay.js';
import { bootstrapCIs } from '../src/engine/bootstrap.js';
const seeds = [20260924, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const tally = { base: { hits: 0, false: 0 }, ci: { hits: 0, false: 0 } };
const widths = [];
for (const s of seeds) {
  const ds = generateDataset(s); const sc = scoreAllMonths(ds); const ci = bootstrapCIs(ds);
  ci.forEach((mo) => Object.values(mo).forEach((c) => widths.push(c.width)));
  const line = [];
  for (const [name, d] of [['base', detectDecay(sc)], ['ci', detectDecay(sc, undefined, undefined, ci)]]) {
    const flags = Object.entries(d).filter(([, v]) => v.decayed).map(([id, v]) => [id, v.decayMonth]);
    const hit = flags.some(([id, m]) => id === 'activation_rate' && (m === 3 || m === 4));
    const fals = flags.filter(([id, m]) => !(id === 'activation_rate' && (m === 3 || m === 4))).length;
    tally[name].hits += hit ? 1 : 0; tally[name].false += fals;
    line.push(`${name}: ${flags.map(([id, m]) => `${id.split('_')[0]}@M${m + 1}`).join(' ') || '-'}`);
  }
  console.log(String(s).padEnd(9), line.join('  ||  '));
}
widths.sort((a, b) => a - b);
console.log(`\nCI width (90%, B=200): median ${widths[Math.floor(widths.length / 2)]}, range ${widths[0]}–${widths[widths.length - 1]}`);
for (const k of ['base', 'ci']) console.log(`${k.padEnd(5)} true decay caught ${tally[k].hits}/10 seeds · false flags ${tally[k].false} (${(tally[k].false / 10).toFixed(1)}/seed)`);
