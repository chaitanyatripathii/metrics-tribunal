// Dev check: prints lifecycle, per-month KPI scores and decay flags for a seed.
// Usage: node scripts/check-data.mjs [seed]
import { generateDataset, DEFAULT_SEED } from '../src/engine/generator.js';
import { scoreAllMonths, lifecycleSeries, KPIS } from '../src/engine/kpis.js';
import { detectDecay } from '../src/engine/decay.js';

const seed = Number(process.argv[2] ?? DEFAULT_SEED);
const ds = generateDataset(seed);
console.log(`seed=${seed} users=${ds.users.length}`);
console.log('\nLifecycle (M = display month):');
for (const r of lifecycleSeries(ds)) console.log(`M${r.month + 1} active=${r.activeUsers} activation%=${r.activationRateActive} monthlyChurn=${r.monthlyChurnRate}`);
const scored = scoreAllMonths(ds);
console.log('\nPredictive power |r| (sign) per month:');
console.log('KPI'.padEnd(24) + scored.map((m) => `M${m.month + 1}`.padStart(13)).join(''));
for (const k of KPIS) {
  console.log(k.name.padEnd(24) + scored.map((m) => { const x = m.kpis.find((q) => q.id === k.id); return `${x.predictivePower}${x.direction === 'risk' ? '+' : '-'}`.padStart(13); }).join(''));
}
console.log('churn-in-window'.padEnd(24) + scored.map((m) => `${m.churnRateInWindow}(${m.churningInWindow}/${m.activeUsers})`.padStart(13)).join(''));
const d = detectDecay(scored);
console.log('\nDecay:');
for (const [id, v] of Object.entries(d)) console.log(id.padEnd(24), v.decayed ? `DECAYED at M${v.decayMonth + 1} (peak ${v.peak} @M${v.peakMonth + 1}, drop ${v.dropAtDecay})` : `stable (peak ${v.peak} @M${v.peakMonth + 1})`);
