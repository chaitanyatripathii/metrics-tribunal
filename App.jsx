import { useMemo, useState, useSyncExternalStore, useEffect, useRef } from 'react';
import { Gavel, Play, KeyRound, AlertTriangle, Scale, RefreshCw, Download, Disc3, FlaskConical } from 'lucide-react';
import { generateDataset, DISPLAY_MONTHS, PRICING_CHANGE_INDEX, DEFAULT_SEED } from './engine/generator.js';
import { scoreAllMonths } from './engine/kpis.js';
import { detectDecay } from './engine/decay.js';
import { computeFindings, MIN_MONTHS_FOR_FINDINGS } from './engine/findings.js';
import { groundingSummary } from './engine/grounding.js';
import { bootstrapCIs } from './engine/bootstrap.js';
import { PERSONAS, kpiMeta, computeAgreement } from './llm/personas.js';
import { fetchRecording, recordingToState, buildRecording, downloadRecording } from './llm/recording.js';
import { PROVIDERS, DEFAULT_PROVIDER } from './llm/client.js';
import { createStore, emptyMonths, runTribunal, completedMonthCount } from './llm/orchestrator.js';
import { TestimonyCard } from './components/Testimony.jsx';
import { DecayChart } from './components/DecayChart.jsx';

// All statistics are computed once, client-side, from the seeded synthetic dataset.
const dataset = generateDataset(DEFAULT_SEED);
const scored = scoreAllMonths(dataset);
const ci = bootstrapCIs(dataset); // 90% bootstrap CIs, used to gate decay flags (Tier 2.1)
const store = createStore({ months: emptyMonths(), running: false, runError: null });

const panel = { background: 'var(--ink-2)', borderColor: 'var(--line)' };

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState(PROVIDERS[DEFAULT_PROVIDER].defaultModel);
  const [selected, setSelected] = useState(0);
  // 'loading' until we know whether a recording ships with this build.
  const [mode, setMode] = useState('loading');
  const [recording, setRecording] = useState(null);
  const [recordingNote, setRecordingNote] = useState(null);

  useEffect(() => {
    fetchRecording({ scored, seed: dataset.seed }).then((r) => {
      if (r.ok) {
        setRecording(r.recording);
        store.set(recordingToState(r.recording, computeAgreement));
        setMode('recorded');
      } else {
        if (r.reason !== 'no recording found') setRecordingNote(`Recorded run not loaded: ${r.reason}.`);
        setMode('live');
      }
    });
  }, []);

  const goLive = () => {
    store.set({ months: emptyMonths(), running: false, runError: null });
    setSelected(0);
    setMode('live');
  };
  const goRecorded = () => {
    store.set(recordingToState(recording, computeAgreement));
    setSelected(0);
    setMode('recorded');
  };

  const completed = completedMonthCount(state.months);
  const inProgress = Math.min(completed, DISPLAY_MONTHS - 1);
  const started = state.months.some((mo) => Object.values(mo.personas).some((p) => p.status !== 'idle'));

  // Follow the month being deposed while a run is active.
  const following = useRef(true);
  useEffect(() => {
    if (state.running && following.current) setSelected(inProgress);
  }, [state.running, inProgress]);

  const decay = useMemo(() => (completed ? detectDecay(scored, completed - 1, undefined, ci) : null), [completed]);
  const findings = useMemo(() => computeFindings({ scored, months: state.months, completed, ci }), [state.months, completed]);
  const grounding = useMemo(() => groundingSummary({ months: state.months, scored, personaIds: PERSONAS.map((p) => p.id), completed }), [state.months, completed]);

  const run = () => {
    following.current = true;
    runTribunal({ store, apiKey: apiKey.trim(), scored, provider, model: model.trim() });
  };

  const mo = state.months[selected];
  const hasError = state.months.some((m) => m.moderator.status === 'error' || Object.values(m.personas).some((p) => p.status === 'error'));
  const buttonLabel = !started ? 'Run tribunal' : completed === DISPLAY_MONTHS ? 'Run complete' : hasError ? 'Retry failed calls & continue' : `Continue from Month ${completed + 1}`;

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest inline-flex items-center gap-2" style={{ color: 'var(--accent)' }}>
              <Gavel size={14} aria-hidden /> Synthetic data · fictional SaaS company
            </p>
            <h1 className="font-display text-4xl mt-1">The Metrics Tribunal</h1>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--muted)' }}>
              Three department leads review the same six months of computed KPI evidence. Where they disagree, and which metrics stop predicting churn after a pricing change, is the point. Correlation only; nothing here claims causation.
            </p>
          </div>
          {mode === 'recorded' && (
            <div className="flex flex-col gap-2 md:items-end">
              <button onClick={goLive} className="inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                <FlaskConical size={16} aria-hidden /> Run it yourself with your key
              </button>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Free Gemini key or Anthropic key. Nothing is stored.</p>
            </div>
          )}
          {mode === 'live' && (
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex gap-2">
              <select
                value={provider}
                onChange={(e) => { setProvider(e.target.value); setModel(PROVIDERS[e.target.value].defaultModel); }}
                disabled={started}
                className="text-sm rounded border px-2 py-2 disabled:opacity-60"
                style={{ ...panel, color: 'var(--text)' }}
                aria-label="Model provider"
              >
                {Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
              </select>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={started}
                className="text-sm rounded border px-2 py-2 font-data w-56 disabled:opacity-60"
                style={{ ...panel, color: 'var(--text)' }}
                aria-label="Model ID"
              />
            </div>
            <label className="flex items-center gap-2 text-sm rounded border px-3 py-2" style={panel}>
              <KeyRound size={14} aria-hidden style={{ color: 'var(--muted)' }} />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={PROVIDERS[provider].keyHint}
                className="bg-transparent outline-none font-data text-sm w-64"
                aria-label="API key"
                autoComplete="off"
              />
            </label>
            <button
              onClick={run}
              disabled={!apiKey.trim() || state.running || completed === DISPLAY_MONTHS}
              className="inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#1b1406' }}
            >
              {hasError && started ? <RefreshCw size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              {state.running ? 'Deposing…' : buttonLabel}
            </button>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Key held in memory for this tab only. Calls go straight from your browser to the provider{state.modelsUsed?.length ? ` (this run: ${state.modelsUsed.join(', ')})` : ''}.
            </p>
            <div className="flex gap-3 text-xs">
              {completed === DISPLAY_MONTHS && (
                <button onClick={() => downloadRecording(buildRecording({ state, scored, seed: dataset.seed }))} className="inline-flex items-center gap-1.5 underline" style={{ color: 'var(--text)' }}>
                  <Download size={14} aria-hidden /> Download run
                </button>
              )}
              {recording && !state.running && (
                <button onClick={goRecorded} className="underline" style={{ color: 'var(--muted)' }}>Back to recorded run</button>
              )}
            </div>
          </div>
          )}
        </header>

        {mode === 'recorded' && recording && <RecordedBanner recording={recording} />}
        {mode === 'live' && recording && (
          <p className="text-xs rounded border px-3 py-2" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
            Live mode: calls are made now, from your browser, with your key.
          </p>
        )}
        {recordingNote && <p className="text-xs" style={{ color: 'var(--danger)' }}>{recordingNote}</p>}

        {state.runError && (
          <p className="text-sm flex items-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={16} aria-hidden /> {state.runError}
          </p>
        )}

        <MonthTabs months={state.months} selected={selected} completed={completed} started={started} onSelect={(i) => { following.current = false; setSelected(i); }} />

        <section aria-labelledby="month-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 id="month-heading" className="font-display text-2xl">Month {selected + 1}</h2>
            <p className="text-sm font-data" style={{ color: 'var(--muted)' }}>
              {scored[selected].activeUsers} active users · {scored[selected].churningInWindow} churn the following month
            </p>
            {selected === PRICING_CHANGE_INDEX && <PricingBadge />}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PERSONAS.map((p) => (
              <TestimonyCard
                key={p.id}
                persona={p}
                call={mo.personas[p.id]}
                monthScore={scored[selected]}
                prevPick={selected > 0 ? state.months[selected - 1].personas[p.id].result?.picked_kpi_id : null}
                onRetry={run}
                running={state.running || !apiKey.trim()}
              />
            ))}
          </div>
          <Verdict month={mo} onRetry={run} disabled={state.running || !apiKey.trim()} />
        </section>

        <section className="rounded-lg border p-5" style={panel} aria-labelledby="ledger-heading">
          <h2 id="ledger-heading" className="font-display text-xl mb-3">Decay ledger</h2>
          <DecayChart scored={scored} decay={decay} shownMonths={completed} ci={ci} />
        </section>

        <Findings findings={findings} completed={completed} grounding={grounding} />

        <footer className="text-xs pb-6" style={{ color: 'var(--muted)' }}>
          Dataset: {dataset.users.length} synthetic users, seed <span className="font-data">{dataset.seed}</span>. Every statistic on this page is computed in the browser from that dataset; the model only sees the aggregated numbers and argues a position.
        </footer>
      </div>
    </div>
  );
}

function RecordedBanner({ recording }) {
  const when = new Date(recording.recordedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <div className="rounded-lg border px-4 py-3 flex items-start gap-3" style={{ borderColor: 'var(--accent)', background: 'var(--ink-2)' }} role="status">
      <Disc3 size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
      <p className="text-sm">
        <span className="font-semibold" style={{ color: 'var(--accent)' }}>Recorded run, not live.</span>{' '}
        The persona and moderator text below is real model output from <span className="font-data">{recording.modelsUsed.join(', ') || 'unknown model'}</span>, recorded {when}. No calls are being made. KPI numbers, decay flags, agreement levels and findings are recomputed by code from the dataset as you view this.
      </p>
    </div>
  );
}

function PricingBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
      Pricing change this month
    </span>
  );
}

function monthStatus(mo, i, completed) {
  if (i < completed) return 'done';
  const calls = [...Object.values(mo.personas), mo.moderator];
  if (calls.some((c) => c.status === 'error')) return 'error';
  if (calls.some((c) => c.status === 'loading')) return 'loading';
  return 'idle';
}

function MonthTabs({ months, selected, completed, started, onSelect }) {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Months">
      {months.map((mo, i) => {
        const status = monthStatus(mo, i, completed);
        const reachable = i <= completed && (started || i === 0);
        const active = i === selected;
        const dot = { done: '#199e70', error: 'var(--danger)', loading: 'var(--accent)', idle: '#44526f' }[status];
        return (
          <button
            key={i}
            onClick={() => reachable && onSelect(i)}
            disabled={!reachable}
            aria-current={active ? 'true' : undefined}
            className="flex flex-col items-start rounded border px-3 py-2 text-left disabled:opacity-40 shrink-0"
            style={{ background: active ? 'var(--ink-3)' : 'var(--ink-2)', borderColor: active ? 'var(--accent)' : 'var(--line)', minWidth: 104 }}
          >
            <span className="flex items-center gap-2">
              <span className="font-data text-lg">{String(i + 1).padStart(2, '0')}</span>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} aria-label={status} />
            </span>
            <span className="text-xs" style={{ color: i === PRICING_CHANGE_INDEX ? 'var(--accent)' : 'var(--muted)' }}>
              {i === PRICING_CHANGE_INDEX ? 'Pricing change' : `Month ${i + 1}`}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

const AGREEMENT_LABEL = { full: 'Full agreement', partial: 'Partial agreement', none: 'No agreement' };

function Verdict({ month, onRetry, disabled }) {
  const mod = month.moderator;
  return (
    <div className="rounded-lg border p-5 flex flex-col gap-2" style={panel}>
      <h3 className="font-display text-lg inline-flex items-center gap-2">
        <Scale size={18} aria-hidden style={{ color: 'var(--accent)' }} /> Verdict
      </h3>
      {month.agreement ? (
        <p className="text-sm">
          <span className="font-semibold">{AGREEMENT_LABEL[month.agreement]}</span>
          <span style={{ color: 'var(--muted)' }}> · computed from the three picks</span>
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Pending all three testimonies.</p>
      )}
      {mod.status === 'loading' && <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Moderator deliberating…</p>}
      {mod.status === 'done' && (
        <>
          <p className="text-sm leading-relaxed">{mod.result.tension_summary}</p>
          {mod.result.agreement !== month.agreement && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Moderator labelled this “{mod.result.agreement}”, which does not match the picks; the computed label is used.
            </p>
          )}
        </>
      )}
      {mod.status === 'error' && (
        <div className="text-sm flex flex-wrap items-center gap-3" style={{ color: 'var(--danger)' }}>
          <span className="inline-flex items-center gap-2"><AlertTriangle size={16} aria-hidden /> Moderator call failed: {mod.error}</span>
          <button onClick={onRetry} disabled={disabled} className="inline-flex items-center gap-1.5 px-3 py-1 rounded border disabled:opacity-50" style={{ borderColor: 'var(--danger)' }}>
            <RefreshCw size={14} aria-hidden /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

function Findings({ findings, completed, grounding }) {
  return (
    <section className="rounded-lg border p-5" style={panel} aria-labelledby="findings-heading">
      <h2 id="findings-heading" className="font-display text-xl">Findings</h2>
      {!findings ? (
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          Computed from this run once {MIN_MONTHS_FOR_FINDINGS} months are complete ({completed} so far).
        </p>
      ) : (
        <>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>From this run’s own output, months 1–{findings.monthsCounted}.</p>
          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <Stat
              value={`${Math.round(findings.disagreementPct * 100)}%`}
              label="of months ended in partial or no agreement"
              detail={`${findings.disagreementMonths} of ${findings.monthsCounted} months`}
            />
            <Stat
              value={findings.avgDecayDrop === null ? '—' : findings.avgDecayDrop.toFixed(3)}
              label="average predictive-power drop among decayed KPIs"
              detail={
                findings.decayedKpis.length
                  ? findings.decayedKpis.map((d) => `${kpiMeta(d.id).name}: ${d.peak.toFixed(3)} (M${d.peakMonth + 1}) → ${d.series[d.series.length - 1].toFixed(3)} (M${findings.monthsCounted})`).join(' · ')
                  : 'No KPI has decayed yet'
              }
            />
            <Stat
              value={grounding.groundedRate === null ? '—' : `${Math.round(grounding.groundedRate * 100)}%`}
              label="of persona responses cited their pick’s computed numbers, with every quoted figure found in the source data"
              detail={`${grounding.grounded} of ${grounding.responses} responses · ${grounding.numbersUnmatched} of ${grounding.numbersQuoted} quoted figures not in source${grounding.failures.length ? ' · ' + grounding.failures.map((f) => `M${f.month + 1} ${PERSONAS.find((p) => p.id === f.persona).title}${f.unmatched.length ? ` (${f.unmatched.join(', ')})` : ''}`).join(', ') : ''}`}
            />
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            Grounding is a numeric check by code: decimals quoted in each reasoning are matched against the numbers in the prompt that persona received. It does not judge whether a correct number is used in a sound argument.
          </p>
          {findings.moderatorMismatches > 0 && (
            <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
              Moderator’s own agreement label disagreed with the picks in {findings.moderatorMismatches} month(s); the computed label is used above.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ value, label, detail }) {
  return (
    <div className="rounded border p-4" style={{ borderColor: 'var(--line)', background: 'var(--ink)' }}>
      <p className="font-data text-4xl" style={{ color: 'var(--accent)' }}>{value}</p>
      <p className="text-sm mt-1">{label}</p>
      <p className="text-xs mt-2 font-data" style={{ color: 'var(--muted)' }}>{detail}</p>
    </div>
  );
}
