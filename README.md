# The Metrics Tribunal

See **METHODOLOGY.md** for formulas, results and limitations.

Client-side React app (Vite + Tailwind + Recharts + lucide-react). No backend, no storage.

## Run
    npm install
    npm run dev          # open the URL, pick a provider, paste a key, click "Run tribunal"

Default provider: Google Gemini free tier. Get a free key at https://aistudio.google.com (API keys).
A 6-month run is 24 calls. The model ID box is editable: if the default says "not found" or
the quota is 0, try another Flash model ID from https://ai.google.dev/gemini-api/docs/models.
Anthropic (claude-sonnet-4-6, the PRD's original model) is still available from the dropdown.

## Recorded run (what the deployed site shows by default)
1. Do a full live run, then click **Download run**. This saves `recorded-run.json`.
2. Put that file in `public/recorded-run.json` and rebuild or redeploy.
3. The app then opens in "Recorded run, not live" mode. The persona and moderator text comes from the file.
   Every statistic is still recomputed by code. A fingerprint check refuses the file if the computed
   KPI numbers no longer match what the personas were shown. "Run it yourself with your key" switches to live mode.

## Deploy (Vercel)
    npx vercel --prod
Run it from this folder. The first time, it asks you to log in and confirm the project settings; the Vite defaults are fine.

## Dev checks (no API key needed)
    node scripts/check-data.mjs [seed]    # lifecycle, per-month predictive power, decay flags
    node scripts/sweep.mjs                # decay flags across 10 seeds (threshold only)
    node scripts/sweep-ci.mjs             # false-flag rate before/after the bootstrap CI check
    node scripts/test-orchestrator.mjs    # resume / per-call error handling against a MOCK fetch
    node scripts/test-recording.mjs       # record -> replay round trip and its guards (MOCK output)
    node scripts/check-grounding.mjs      # grounding rate for public/recorded-run.json (+ matcher unit checks)

## Where each number comes from
- KPI values + predictive power: `src/engine/kpis.js` (`scoreAllMonths`, Pearson / point-biserial in `stats.js`)
- Decay flags: `src/engine/decay.js`
- Agreement level: `computeAgreement` in `src/llm/personas.js` (from the three picks, not from the moderator)
- Findings: `src/engine/findings.js`
The LLM only receives the aggregated numbers (`buildPersonaPrompt`) and returns picks + reasoning.

## Known limitations / decisions
- Default model changed from the PRD's claude-sonnet-4-6 to a free Gemini Flash model, for cost reasons. The model used is shown in the UI and must be named in results.
- Churn label window is 1 month (PRD allows 1–2). With 2 months, decay fired at Month 3, before the pricing change marker.
- The 0.15 threshold alone gave 1.5 false decay flags per seed across 10 seeds. Adding the bootstrap CI check brings that to 0.6 per seed, with true detection unchanged at 9/10 (see METHODOLOGY.md).
- Months 7–8 are simulated only so Month 6 has an outcome window; they are never displayed.

## Next (deliberately out of scope for now)
- Contestation loop: push back on a persona's pick (Tier 2.3).
- Multi-seed evaluation harness as a shipped UI feature (Tier 2.4). The 10-seed sweep in `scripts/sweep.mjs` is the evidence used so far.
- Tier 3: multi-seed dashboard, second synthetic scenario.
