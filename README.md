# Osora Studio

The internal research, creation and production platform behind Osora.

Osora Studio is not a meditation content management system. It is a **decision
system with an audio renderer attached**. The generated audio file is the
delivery format; the thing being built and improved here is the logic that
decides what should be in it.

The central product principle:

> The listener does not choose the method. They describe their state, their
> preferences and their boundaries. Osora selects the combination of
> interventions.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No configuration is required. The first milestone runs entirely on seeded data
with mock providers. You do need **ffmpeg** on your PATH — audio measurement is
mandatory, not best-effort, and the Audio Lab will tell you if it is missing.

```bash
brew install ffmpeg          # macOS
apt-get install ffmpeg       # Debian/Ubuntu
```

Copy `.env.example` to `.env.local` when you want to attach a real Supabase
project or a live LLM/TTS provider.

---

## Architecture

Layers are strictly ordered. Each may only depend on the ones above it.

```
0  Identity & governance    roles · permissions · audit log · versioning
1  Knowledge base           states · mechanisms · interventions · evidence
                            professionals · rules · Osora DNA
2  Constraint layer         preferences (soft) · boundaries (hard)
3  State Engine             gate → score → select → allocate → sequence → explain
4  Timeline planner         SessionPlan → SectionTimeline with word budgets
5  Composition (LLM)        fills section text inside budgets; plan is frozen
6  Production               TTS / sound → assets → MANDATORY ffprobe measurement
7  Reconciliation           measured durations → recomputed timeline → flow + rules
8  Review & publication     skill-matched reviewers · blocking gates
9  Learning                 experiments · outcomes · attribution
```

### The three invariants

Everything else is detail. These three are the product.

**1. Hard boundaries are structural, not scored.**

A boundary does not compete with a score — it removes candidates from the set
before scoring begins. An intervention tagged `visualisation` is gone before
ranking when the listener has `no_visualisation`: it never reaches the
ranking, never reaches the composer, never appears in a prompt. There is no
numeric path by which a boundary can lose, because it is never a number.

**2. The plan is frozen before the model writes a word.**

The LLM enters at layer 5. By then the mechanisms, the interventions, the
sequence, the seconds and the per-section word budgets are already decided. The
model writes text into sections it cannot add to, remove from, or overrun.
Responses are re-validated against the plan on the way back — unknown section
ids are dropped and word counts are recomputed rather than trusted.

**3. A duration is not real until ffprobe has measured it.**

Providers approximate. Requested durations are wishes. Every generated or
uploaded file is measured server-side, and `audio_assets` carries a database
CHECK that makes it *impossible* to mark an asset ready without a measured
duration:

```sql
constraint audio_assets_ready_requires_measurement check (
  status <> 'ready' or (actual_duration_seconds is not null and actual_duration_seconds > 0)
)
```

Requested, actual and the difference are all stored. A failed measurement
leaves the asset at `failed` — the requested duration is never used as a
fallback, because a plausible wrong number is worse than a missing one.

---

## The State Engine

Six deterministic stages. No machine learning, no sampling, no LLM. The same
input always produces the same plan, and every decision leaves a trace entry.

```
1. GATE      hard boundaries → drop by boundary tag
             contraindications vs reported state → drop
             review status → drop anything not approved
             if the field empties → fall back to the always-safe core set
                                    (constraints are never relaxed)

2. SCORE     per mechanism:
               + directional fit        does it serve what was asked for
               + state suitability      expert conditions currently met
               − unsuitability penalty
               + evidence weight        strong 1.0 … unverified 0.1
               ± soft preference        capped at ±0.8
               ± recorded outcomes      capped at ±0.6

3. SELECT    top-N by capacity (duration / 150s, clamped 3–6)
             enforce incompatibility pairs; higher score wins, loser traced

4. ALLOCATE  shares → seconds, clamped to [minExposure, maxExposure]
             residual redistributed to mechanisms with headroom
             rescaled to land on the target duration

5. SEQUENCE  fixed Osora grammar decides order, never the ranking:
               opening → orientation → breath → body → main → silence → closing
             locked sections inserted regardless of scoring
             ≤ 1 unfamiliar major intervention per session

6. EXPLAIN   confidence = f(evidence, state coverage, score margin)
             warnings for every compromise made
```

The distinction in gating between a **hard boundary** and a
**contraindication** is deliberate: a boundary removes a mechanism at any
weight, because it is the listener's decision. A contraindication removes only
blocks where the excluded mechanism is a primary driver (weight ≥ 0.7) — blocks
that merely touch it remain governed by their own contraindications, which a
qualified reviewer wrote for exactly that case.

---

## Deterministic timeline

The composer never asks a model for "a ten-minute meditation". It computes the
timing plan first:

| Section          | Duration |
|------------------|----------|
| Arrival          | 8s       |
| Orientation      | 40s      |
| Breath           | 124s     |
| Body             | 132s     |
| Main             | 124s     |
| Silence          | 106s     |
| Closing          | 75s      |

Each section gets a word budget derived from its speaking time at ~105 wpm.
After narration exists, `reconcileTimeline` replaces every estimate with a
measured duration and re-derives the whole arrangement.

When narration overruns, the studio offers remedies **in order**: reduce text,
adjust pauses, regenerate, and only last — bounded to 0.90–1.10× — change the
speaking rate. It is never applied automatically. Compressing narration to hit
a number damages the pacing the plan was built for.

---

## Provider architecture

```
src/providers/
  llm/    types · prompt · mock · hosted (anthropic | openai | gemini) · index
  tts/    types · mock · elevenlabs · index
  audio/  ffprobe · ffmpeg
```

Every provider module imports `server-only`, so a client component that reaches
for one fails at build time rather than shipping a key to the browser. Provider
availability is computed server-side and only the boolean crosses the wire.

The **mock TTS provider generates real PCM WAV bytes**, so the full pipeline —
generate → write → ffprobe → compare → store — runs offline exactly as it will
in production, including a deliberate wobble between requested and actual
duration. That gap is a property of the pipeline, not something that only shows
up once a real vendor is wired in.

Model capabilities are declared **per model**, not per provider, because they
genuinely differ: a speech model cannot generate a soundscape, and not every
model accepts a seed or honours a requested duration. The UI reads these flags
so it never offers a control the selected model ignores.

---

## Rules and safety

Rule *logic* lives in TypeScript so it stays deterministic and testable. Rule
*metadata* — active, severity, owner, version — lives in the database so
governance can be tuned without a deploy.

Severity is a ladder: `information` → `recommendation` → `warning` →
`blocking`. Anything blocking disables publication. There is no override and no
role that can grant one.

Claim detection runs over every script. Blocking patterns — *cures*, *treats*,
*prevents*, *guarantees*, *clinically proven*, *scientifically proven*,
diagnostic language, medication references — have no approvable form. Others,
like a physiological mechanism claim, route to a reviewer holding the relevant
skill.

The provenance ladder is enforced throughout:

| Source                | May claim      | May approve  |
|-----------------------|----------------|--------------|
| Scientific evidence   | yes            | —            |
| Expert opinion        | yes, labelled  | within skill |
| Traditional practice  | yes, labelled  | no           |
| Internal hypothesis   | yes, labelled  | no           |
| **AI suggestion**     | **draft only** | **never**    |

An AI "professional perspective" is an editorial drafting tool. It is recorded
as a generation run, never as a review, and the review queue does not count it.

---

## Project structure

```
src/
  app/(studio)/…            17 studio routes
  app/api/audio/…           upload + generate, both measured server-side
  domain/                   pure logic — no React, no Next, no Supabase, no I/O
    state/ mechanisms/ interventions/ constraints/
    engine/                 the State Engine
    timeline/               planner · speech estimation · reconciliation
    dna/ rules/ flow/ safety/ outcomes/
  providers/                llm · tts · audio
  data/seed/                realistic placeholder data
  components/ui/            shadcn-style primitives
  components/studio/        shell, composer panels, audio timeline
  lib/supabase/             client + generated types
supabase/migrations/        schema + reference data
```

`src/domain/**` imports nothing from React, Next or Supabase. That is what
makes the engine testable and the rule validation deterministic.

The seeded experiences are **not hand-written fixtures** — each one runs the
real State Engine and the real timeline planner at module load, so the
placeholder data is internally consistent with the logic the studio uses,
including its warnings, its exclusions and its drift.

---

## The seventeen routes

| Route | What it is for |
|---|---|
| `/dashboard` | What needs attention: reviews, failed validations, duration mismatches |
| `/states` | The 16 self-reported dimensions and the desired directions |
| `/mechanisms` | Method-independent mechanisms with gates and exposure windows |
| `/interventions` | Reusable blocks, boundary tags, internal provenance |
| `/experiences` | The session pipeline |
| `/composer` | Three-column editor: state → plan → script → timeline |
| `/dna` | What stays stable, what may adapt, and how fast |
| `/evidence` | Sources, limitations, verification status |
| `/professionals` | Skills, review permissions, coverage gaps |
| `/experiments` | One-variable A/B tests with written stop conditions |
| `/outcomes` | Pre/post state change and attribution |
| `/voices` | Voice library and per-model capabilities |
| `/sounds` | Sound library and licence metadata |
| `/audio-lab` | Multitrack arrangement, upload, real measurement |
| `/reviews` | Skill-matched review queue |
| `/rules` | Rule registry with live pass/fail counts |
| `/settings` | Providers, roles, generation runs, audit log |

---

## Database

45 tables in `supabase/migrations/`. Notable decisions:

- Enums are Postgres types, so invalid states are unrepresentable.
- `*_versions` tables are append-only `jsonb` snapshots — cheap and complete.
- `evidence_links` is polymorphic, so one source can back a mechanism, an
  intervention, a section and a safety rule.
- `scientific_sources` cannot be marked verified without a named verifier.
- `sound_assets` cannot be approved without licence metadata.
- `audio_assets.duration_delta_seconds` is a generated column — never written.
- RLS is on for every listener-owned table; studio tables are staff-read.

Apply with:

```bash
npx supabase db push
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```

---

## Deployment

**Read this before deploying to Vercel.** The mandatory-measurement invariant
does not survive a naive serverless deploy.

`ffprobe` and `ffmpeg` are not present in Vercel's serverless runtime. Every
generated or uploaded asset would fail measurement, which — correctly — means
nothing could ever be marked ready. The failure is loud rather than silent,
but it is still a failure.

Three workable shapes, in increasing order of effort:

**1. Vercel + bundled static binaries (measurement only).**
Add `ffprobe-static` and include it in the function bundle:

```ts
// next.config.ts
outputFileTracingIncludes: {
  "/api/audio/**": ["./node_modules/ffprobe-static/bin/**"],
}
```

Then point `FFPROBE_PATH` at the unpacked binary. This gets you *measurement*,
which is the invariant that matters. It does not get you assembly: a 12-minute
mix with `loudnorm` will exceed the function time limit, and `/tmp` is ephemeral
and per-invocation, so a multi-step pipeline cannot share files between calls.

**2. Vercel for the app, a container for audio (recommended).**
Deploy the Next.js app to Vercel and move `/api/audio/*` to a small container
service on Fly.io, Railway or Render where ffmpeg is a one-line Dockerfile
install. Audio lands in Supabase Storage and is served through signed URLs, so
neither side needs a persistent disk. This is the shape the code already
assumes — `src/providers/audio/*` is isolated behind two modules precisely so it
can move.

**3. Everything in one container.** Simplest to reason about, and fine until
the studio needs to scale differently from the audio work.

### Vercel plan notes

- **Hobby (free) does not cap the number of projects** — you can run many. The
  binding constraint is that Hobby is licensed for non-commercial use only.
  Osora Studio is an internal company platform, so it needs **Pro**.
- Hobby also has a short function timeout, which the assembly step would exceed
  regardless of the binary question.
- Vercel's limits change; check the current pricing page rather than trusting
  this paragraph.

### Environment gotcha

`.env.example` lists optional variables as bare keys (`FFPROBE_PATH=`). Copying
it verbatim sets them to **empty strings**, and `??` does not fall back on an
empty string. All environment reads go through `src/lib/env.ts`, which treats
blank as unset. Use it rather than `process.env` directly.

---

## What this milestone deliberately does not do

- **No machine-learning personalisation.** Explicit rules, transparent scoring
  and recorded outcomes, so that a learning system can be added later against
  data that was collected honestly.
- **No autonomous experiment optimisation.** Assignment is manual and stop
  conditions are written down before the first participant.
- **No persistence of edits.** The studio reads seeded data; the composer's
  actions show the state machine a real handler drives without pretending work
  happened.
- **No diagnosis, ever.** The state model captures self-reported dimensions.
  It does not name conditions, and the platform does not treat anything.

---

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```
