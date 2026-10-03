# The Metrics Tribunal: Methodology

This project applies existing techniques (persona-based LLM reasoning, and tracking whether a metric's predictive power decays) to a combination that existing KPI tools don't usually offer. It is not a new method or a research contribution. Everything below runs on **synthetic data**, and every statistic is **correlation, not causation**.

Every number the app shows as a statistic is computed by deterministic code from a seeded dataset. The language model only receives those aggregated numbers and argues a position. It never sees user-level data, and it never produces a number that the app then displays as a statistic.

---

## 1. Architecture

```mermaid
flowchart LR
  G[Synthetic data generator<br/>seeded, 290 users] --> S[KPI scorer<br/>value + |r| per month]
  G --> B[Bootstrap CIs<br/>200 resamples]
  S --> D[Decay detector]
  B --> D
  S --> P[3 persona LLM calls / month<br/>aggregated numbers only]
  P --> M[Moderator LLM call<br/>tension summary]
  P --> A[Agreement level<br/>computed by code]
  P --> GR[Grounding check<br/>computed by code]
  D --> UI[Timeline UI + Findings]
  A --> UI
  M --> UI
  GR --> UI
  P -. recorded run JSON .-> UI
```

| Stage | Code | LLM? |
|---|---|---|
| Data generation | `src/engine/generator.js` | No |
| KPI values + predictive power | `src/engine/kpis.js`, `stats.js` | No |
| Bootstrap CIs | `src/engine/bootstrap.js` | No |
| Decay detection | `src/engine/decay.js` | No |
| Persona picks + reasoning | `src/llm/personas.js`, `orchestrator.js` | **Yes** |
| Agreement level | `computeAgreement` in `personas.js` | No |
| Moderator tension summary | `personas.js` | **Yes** (text only) |
| Grounding check | `src/engine/grounding.js` | No |
| Findings | `src/engine/findings.js` | No |

---

## 2. Synthetic data

- **290 users**, seed `20260924`. Signups arrive over Months 1–6: 120 in Month 1, then 40, 36, 34, 32 and 28.
- Each user has two hidden traits: **activation** (a yes/no flag for "engaged heavily in week 1", 55% chance) and **engagement** (a 0–1 score correlated with activation).
- Each month, every user gets: feature-usage count (0–10), weekly stickiness (0–1), invited-a-teammate flag, upgraded-plan flag, and a satisfaction score (1–10).
- **Churn** is decided monthly, using the user's behaviour in the *previous* month.
  - **Before the pricing change**, not being activated adds 30 percentage points of monthly churn risk. It is the dominant churn driver.
  - **From Month 5**, the first month billed under the new pricing, activation adds only 2 points. Shallow feature use (up to 30 points) and not having upgraded (10 points) become the dominant drivers.
- Months 7–8 are simulated only so that Month 6 has an outcome to predict. They are never displayed.

---

## 3. Formulas, in plain language

**KPI value.** The average of each active user's value that month. For yes/no KPIs, this average is a rate (e.g. Activation Rate = share of active users who activated).

**Predictive power.** Take all users active in month *m*. For each one, pair their KPI value that month with whether they churn in the following month (1 or 0). Predictive power is the absolute value of the Pearson correlation between those two columns. When the KPI is also yes/no, this is the point-biserial correlation. 0 means no relationship and 1 means a perfect one. The sign is kept separately as "protective" (higher value, less churn) or "risk".

**Noise band (shown to the personas).** 1/√n, where *n* is the number of active users that month. This is roughly the standard error of a correlation near zero, and it gives the personas a scale for how big a gap is meaningful (±0.077 to ±0.091 here). It is a rough guide, not a test. The gap between two correlations is noisier than either one alone.

**Decay.** A KPI is flagged as decayed in month *m* if both of these hold:
1. its predictive power is at least **0.15** below its own earlier peak, and
2. the drop is larger than the width of the **90% bootstrap confidence interval** at both the peak month and month *m*.

The first month where both hold is the decay point.

**Bootstrap CI.** For each KPI and month, resample the active users with replacement 200 times, recompute predictive power each time, and take the 5th and 95th percentiles. Resampling is seeded, so results are reproducible. Example: Activation Rate's peak in Month 2 is 0.408 with CI [0.262, 0.504] (width 0.242). In Month 4 it's 0.077 with CI [0.008, 0.207] (width 0.199). The drop of 0.331 exceeds both widths, so it is flagged.

**Agreement level.** Computed by code from the three picks: *full* if all three are the same, *partial* if exactly two match, *none* if all differ. The moderator LLM also returns a label; it is logged and shown when it disagrees, but never used.

**Grounding check.** Two tests on each persona's reasoning text:
1. It must cite its picked KPI's computed value or predictive power.
2. Every decimal number it quotes must be a correct rounding of a number in the prompt that persona received. For example, "0.09" matches 0.090, but "0.45" does not match 0.245.

A response is *grounded* only if it passes both. Integers are ignored, because month numbers and user counts collide too easily.

**Findings.**
- Disagreement % = months with partial or no agreement ÷ months completed.
- Average decay drop = mean of (peak − latest value) over decayed KPIs.
- Grounding rate = grounded responses ÷ persona responses.

---

## 4. Design decisions

**Churn window: 1 month.** Predictive power correlates a KPI in month *m* with churn in month *m+1*. The PRD allowed 1–2 months. A one-month window gives a more immediate, actionable signal, and there are fewer events in between that could blur the link between the reading and the outcome. *This window was chosen after testing both on a 10-seed sweep; see Limitations.*

**Agreement is computed by code, not by the moderator.** This keeps the disagreement % a computed statistic, in line with the rule that every displayed statistic comes from code.

**Persona prompt design.** With the first prompt ("pick the metric the company should steer by"), all 18 picks were simply the KPI with the highest predictive power, and disagreement was **0%**. That happened even in Months 3–6, where the gap to the second-best KPI was only 0.04–0.08, within noise. The revised prompt asks each lead to pick the KPI **their department** will be measured on. It gives each lead a list of the KPIs its team can run programs against (context, not a constraint) and the noise band. It also requires associational language and bans "statistically significant". Two runs on the revised prompts gave **83%** and **50%** disagreement.

**Model.** The PRD specified `claude-sonnet-4-6`. For cost reasons, the shipped run uses **`gemini-3.5-flash-lite` on Google's free tier**. The app records which model produced each run and shows it in the UI.

**Recorded run.** The deployed site replays one real run by default, so visitors don't need an API key. The recording stores only model outputs and the prompts that produced them, with no statistics. All statistics are recomputed on load. A fingerprint of every predictive-power figure makes the app refuse a recording if the numbers have changed since it was made. A live mode is available with the visitor's own key.

---

## 5. Results

**Shipped recorded run** (seed 20260924, `gemini-3.5-flash-lite`, prompt v3):

| Measure | Value |
|---|---|
| Months ending in partial or no agreement | **50%** (3 of 6) |
| KPIs decayed | Activation Rate, flagged at Month 4 |
| Average predictive-power drop among decayed KPIs | **0.285** (0.408 at M2 → 0.123 at M6) |
| Persona responses grounded | **89%** (16 of 18) |
| Quoted figures not found in source data | 2 of 60 |

The two grounding failures were both in Month 4:
- Retention wrote the noise band as "±0.77" when the actual figure was 0.077.
- Finance said Feature Adoption Depth "dropped from 0.45" when it was actually 0.245.

The numbers on each card are computed independently, so the correct figures were shown next to the wrong ones.

**False-decay-flag rate, before and after the bootstrap check** (`scripts/sweep-ci.mjs`, 10 seeds). The ground truth is that only Activation Rate decays, after Month 4. A flag on Activation Rate at Month 4 or 5 counts as a hit; any other flag counts as a false flag.

| Decay rule | True decay caught | False flags | Per seed |
|---|---|---|---|
| 0.15 threshold only | 9 / 10 seeds | 15 | 1.5 |
| 0.15 threshold + bootstrap CI check | 9 / 10 seeds | 6 | 0.6 |

The bootstrap check removed 60% of false flags without losing any true detections. The two rules missed on different seeds: the threshold alone flagged seed 3 too early (Month 3), and the CI rule flagged seed 9 too late (Month 6). The median 90% CI width was 0.217 (range 0.059–0.345).

**Why the CI check matters.** Without it, a 0.15 drop is often within the range that sampling alone produces at this sample size. The CI widths are larger than 0.15 most months. So the threshold-only rule flags noise as "decay" about 1.5 times per run, and a PM would be told to abandon metrics that never changed. The CI check asks whether the drop is bigger than the month-to-month uncertainty in the measurement itself.

---

## 6. Limitations

- **Synthetic data only.** The regime shift was built into the generator, so detecting it shows the pipeline works on a known answer. It says nothing about real companies.
- **Correlation, not causation.** Predictive power is correlation. The app never claims a KPI causes churn, and the personas are told not to either.
- **Single domain and scenario.** One fictional B2B SaaS company with one pricing change. A different kind of shift has not been tested.
- **Small persona set.** Three fixed personas. Their disagreement is partly *produced by design*: the per-department KPI lists in the prompt are what gives them reason to differ. The disagreement rate depends on that design choice, and there are only two runs of the revised prompt on one model (83% and 50%).
- **Thresholds and parameters were tuned by inspection, not cross-validated.** The 0.15 decay threshold, the 90% CI level, 200 bootstrap iterations, the hazard coefficients in the generator, and the **1-month churn window** were all chosen by eye. In particular, the churn window was picked **after a 10-seed sweep** showed that a 2-month window flags the activation decay at Month 3, before the pricing change marker, in 8 of 10 seeds. A 1-month window flags it at Month 4 in 8 of 10.
- **An earlier undercount, now corrected.** Early notes said "about 1 false flag per seed". The precise sweep above measures 1.5 per seed (14 flags on KPIs with no injected change, plus 1 early activation flag).
- **Remaining false flags are not all clearly false.** The 6 remaining flags are: WAU/MAU (2), Invite Rate (2), Expansion Rate (1), and one Activation Rate flag that came late (Month 6). WAU/MAU is generated partly from the same engagement trait as activation, so some of its decline may be real, indirect decay rather than noise. The ground truth here is simplified.
- **The grounding check is numeric only.** It catches misquoted numbers. It does not catch a correct number used in a weak argument (e.g. "well above the noise band" for a figure only 1.35× the band) or reasoning that is wrong in ways that don't involve numbers.
- **The noise band given to the personas is approximate.** 1/√n understates the uncertainty of a *difference* between two correlations.
- **Model dependence.** Results come from one small free-tier model. A stronger model might disagree less, or quote numbers more reliably. That hasn't been tested.
- **No formal hypothesis testing.** No p-values and no user studies. The bootstrap CI is a lightweight uncertainty check aimed at one measured problem (false decay flags), not a significance test.

---

## 7. Reproducing

```
npm install
node scripts/check-data.mjs          # lifecycle + predictive power + decay for the default seed
node scripts/sweep-ci.mjs            # false-flag rate before/after bootstrap, 10 seeds
node scripts/check-grounding.mjs     # grounding rate on public/recorded-run.json
node scripts/test-orchestrator.mjs   # run/resume/error handling (mocked model)
node scripts/test-recording.mjs      # record → replay round trip (mocked model)
npm run dev                          # the app
```
