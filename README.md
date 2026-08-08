# zing

Scrollable learning app. School material-based, AI boosted.

Point a phone at today's worksheet and get it back as a vertical feed: narrated
lesson slides with generated illustrations, native quiz widgets between them,
and a scorecard at the end. The full design is in [`docs/ARCH.md`](docs/ARCH.md).

```
api/       Next.js API-only backend (Vercel). The agent swarm; holds every key.
mobile/    Expo app (React Native + TypeScript), runs in Expo Go.
docs/      PRD + architecture.
```

The two halves talk over one contract, the **Batch Spec** (ARCH §3):

- `api/lib/schema.ts` — Zod, the source of truth.
- `mobile/src/types/batch.ts` — a plain TypeScript mirror. Change one, change
  the other; Expo Go runs Metro straight off `mobile/`, and a shared workspace
  package buys nothing at this size.

---

## Prerequisites

| | |
| --- | --- |
| **Node** | ≥ 20.9 (Next 16's floor). Developed on 24.11. |
| **Expo Go** | On the phone you'll demo from — [iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent). No Xcode or Android Studio needed. |
| **Anthropic API key** | Extractor, Researcher, Planner, Writers, Encourager. |
| **fal.ai key** | Slide illustrations (Flux schnell). |
| **ElevenLabs key** | Per-slide narration. |
| **Vercel Blob token** | Optional but do it before a demo — see [Audio hosting](#audio-hosting). |

No keys yet? Skip to [Quick start without keys](#quick-start-without-keys) — the
whole pipeline runs stubbed.

---

## Quick start

### 1. Backend

```sh
cd api
npm install
cp .env.example .env.local
```

Fill in `ANTHROPIC_API_KEY`, `FAL_KEY` and `ELEVENLABS_API_KEY` **in
`.env.local`**, not in `.env.example`. `.env.local` is gitignored; `.env.example`
is a committed template, and a key pasted there is a key on its way to GitHub.
Then:

```sh
npm run dev            # http://localhost:3000
```

Sanity check in another terminal — this needs no keys and should print the
cached demo batch:

```sh
curl -s localhost:3000/api/fallback | head -c 400
```

### 2. Prove the pipeline before touching a phone

The smoke CLI drives S1 → S4 against your dev server, prints per-stage timings
against the ARCH §2 latency budget, and writes the finished Batch Spec to disk.
Do this first — it is far faster to debug a prompt here than through Metro.

```sh
npm run smoke -- ./worksheet.jpg on-level
npm run smoke -- ./worksheet.pdf challenge
```

```
zing pipeline — worksheet.jpg @ on-level

  extract      136ms  (budget 8000ms — ok)
  research     352ms  (budget 15000ms — ok)
  compose       87ms  (budget 12000ms — ok)
  assets       690ms  (budget 15000ms — ok)

  total       1268ms  (ARCH §2 target: batch starts <45000ms)

  4 groups · 8 slides · slider, single, multi, order · images 8/8 · audio 8/8
  written to batch-on-level.json
```

Any `.jpg`/`.png`/`.webp` goes down the vision path; any `.pdf` goes down the
native document path.

### 3. Deploy the backend

The phone cannot reach `localhost`, so the API needs a public URL.

**Set Root Directory to `api`.** There is no `package.json` at the repo root —
Vercel sees `api/`, `mobile/` and `docs/` and cannot auto-detect the project. If
you import the repo from the dashboard, set it during import (Project Settings →
Build & Deployment → Root Directory). Running `npx vercel` from inside `api/`
sets it for you.

```sh
cd api
npx vercel                                  # first run links the project
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add FAL_KEY
npx vercel env add ELEVENLABS_API_KEY
npx vercel env add BLOB_READ_WRITE_TOKEN    # or add a Blob store to the project
npx vercel deploy --prod
```

Do **not** set `ZING_MOCK` on the deployment — it would serve stubbed batches to
a real audience. Note the deployment URL for step 4.

Only `api/` deploys. `mobile/` is a client that ships through Expo Go and is
never built by Vercel.

> Prefer to stay local? Tunnel port 3000 with any HTTP tunneller and use that
> URL instead. `--tunnel` on the Expo side tunnels *Metro*, not your API.

### 4. App

```sh
cd mobile
npm install
cp .env.example .env
```

Put the URL from step 3 into `.env`:

```
EXPO_PUBLIC_ZING_API_URL=https://your-deployment.vercel.app
```

`EXPO_PUBLIC_` vars are inlined into the JS bundle — never put a service key
there. Then:

```sh
npx expo start --tunnel
```

Scan the QR code with Expo Go. `--tunnel` survives hostile venue Wi-Fi and works
over cellular; `--lan` needs the phone and laptop on the same network.

Restart Metro after editing `.env` — the value is baked in at bundle time.

---

## Quick start without keys

`ZING_MOCK` stubs the three outbound services, so the whole pipeline runs with no
credentials and no spend. Only the network call is replaced — JSON extraction,
Zod validation, the Planner→Writers fan-out and batch assembly are all the real
code paths.

```sh
cd api
npm install
ZING_MOCK=1 npm run dev

# in another terminal — any real image or PDF will do, its contents are ignored
npm run smoke -- ./anything.png on-level
```

Point the app at `http://<your-lan-ip>:3000` and it will play a full stubbed
batch on the phone.

### Exercising the failure paths

```sh
ZING_MOCK=chaos npm run dev
```

`chaos` reproduces the ARCH §7 risk table on demand: a quiz writer answering in
prose, an answer key outside its own slider range, a dead fal call and a dead
ElevenLabs call. The batch that comes out the far side is smaller and partly
un-illustrated, but still valid and still playable — which is exactly the
behaviour the demo depends on.

```
[quiz-writer:Animal habitats]     no JSON value found in model output: I'd suggest asking…
[quiz-writer:Comparing fractions] output failed validation — slider answer falls outside [min, max]
[assets] image failed · [assets] audio failed

compose  5 groups planned → 2 dropped → 3 shipped (slider, single, order)
assets   images 5/6 · audio 5/6
```

---

## Commands

Run from `api/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (also the deploy gate) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke -- <file> [difficulty]` | Drive S1→S4, print timings, write the batch |
| `npm run validate:fallbacks` | Check all three bundled demo batches against the schema |

Run from `mobile/`:

| Command | What it does |
| --- | --- |
| `npx expo start --tunnel` | Metro + QR code for Expo Go |
| `npx tsc --noEmit` | Typecheck |
| `npx expo export --platform ios` | Bundle without a device — catches broken imports |

---

## The pipeline

The app is the Orchestrator's hands: it calls four stages in sequence, passes
each output forward, narrates progress, enforces a 90s cap, and drops to a
bundled fallback batch on any failure.

| Stage | Route | Agents |
| --- | --- | --- |
| S1 | `POST /api/extract` | Extractor — vision or native PDF → subjects, problems, grade band |
| S2 | `POST /api/research` | Researcher swarm — ≤3 parallel calls, `web_search` on |
| S3 | `POST /api/compose` | Planner → Lesson Writers ‖ Quiz Writers ‖ Encourager → validated Batch Spec |
| S4 | `POST /api/assets` | fal Flux schnell ‖ ElevenLabs, full fan-out |
| — | `GET /api/fallback` | the cached demo batch |

### Audio hosting

ElevenLabs returns raw bytes, but the app wants a URL. With
`BLOB_READ_WRITE_TOKEN` set, `/api/assets` uploads each clip to Vercel Blob and
returns a plain URL. Without it, it inlines a base64 `data:` URI — which ARCH
§2.S4 permits as the POC path, but **iOS AVPlayer (behind `expo-audio`) does not
reliably play `data:` URIs**. Without the token expect the batch to run silent
with captions. Set it before a demo.

---

## Before a demo

1. Run `npm run smoke` cleanly on the demo worksheet at `on-level`, then again
   at `challenge`.
2. Bundle the resulting images and audio into the app — see
   [`mobile/src/assets/fallback/README.md`](mobile/src/assets/fallback/README.md).
   fal and ElevenLabs URLs expire, so save the files, not the links.
3. Confirm `BLOB_READ_WRITE_TOKEN` is set on the deployment.
4. Rehearse on cellular with `--tunnel`.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `missing environment variable ANTHROPIC_API_KEY` | Keys go in `api/.env.local`, not `mobile/.env`. Restart the dev server after editing. |
| `401 invalid x-api-key` | A placeholder is being sent as a real key — usually `.env.local` was copied from the template and never filled in, while the real key went into `.env.example`. Check `.env.local`. |
| Changes to `.env.local` seem to have no effect | `next dev` spawns a **detached** server that outlives the CLI, so Ctrl-C may leave it running and serving stale env. Kill the node process holding port 3000, then restart. |
| App falls straight to the bundled batch | `EXPO_PUBLIC_ZING_API_URL` unset, unreachable, or still `localhost`. Check the Metro console for `[zing] pipeline fell back —`. |
| Batch plays silent | No `BLOB_READ_WRITE_TOKEN` (see [Audio hosting](#audio-hosting)), or the phone's silent switch — the app sets `playsInSilentMode`, but only after the first tap. |
| `Another next dev server is already running` | Next 16 allows one per directory. Stop the old process, or use a different port. |
| Slides show captions on a plain tint | fal failed for those slides; the batch still runs. Check the server log for `[zing:assets] image failed`. |
| Compose returns 502 `only N valid group(s)` | Writers produced fewer than 3 valid groups. The server log names each one it dropped and why. |
| Metro can't resolve a module after `npm install` | `npx expo start --clear`. |
| Vercel build fails with no framework detected | Root Directory is not set to `api`. There is no root `package.json`. |

---

## Notes on this scaffold

- **`docs/PRD.md` is empty.** Everything here is built against `docs/ARCH.md`
  alone. If the PRD lands with product requirements the architecture does not
  imply, this scaffold has not seen them.
- **The live-model path is unexercised.** Every stage has run end to end under
  `ZING_MOCK`, but no real call has been made to Claude, fal or ElevenLabs. The
  prompts are the least-tested thing in the repo — run `npm run smoke` with real
  keys before trusting a timing number or a writer's output shape. The RN UI has
  bundled but never rendered on a device.
- **Model.** Pinned to `claude-sonnet-4-6` per ARCH §0, as one constant in
  `api/lib/claude.ts`. Effort is set explicitly per agent (Sonnet 4.6 defaults to
  `high`, which does not fit the latency budget).
- **`expo-image-manipulator`** is the one dependency not named in ARCH. Camera
  photos are resized to 1568px on the long edge before base64-encoding: a raw
  12MP photo encodes to ~8MB, over Vercel's request-body limit, and Claude's
  vision path downsamples past that width anyway.
- **Make it harder** serves the pre-cached Challenge batch, as ARCH §5
  specifies. The live path (compose + assets at level+1, reusing the extraction
  and research already paid for) is implemented behind `LIVE_MAKE_IT_HARDER` in
  `mobile/src/lib/api.ts`.
