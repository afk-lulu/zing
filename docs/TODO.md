# Zing — PRD/ARCH conformance and remaining work

Audited 2026-08-08 against [PRD.md](PRD.md) and [ARCH.md](ARCH.md).

**The pipeline now runs end to end against real providers, inside the PRD §10
latency target, with the demo insurance bundled.** The previous edition of this
file said the gap was evidence rather than features. That evidence now exists —
and it found four things that mocks never could.

---

## Done — verified against a real run

| Req | Where | Evidence |
|---|---|---|
| **F1 Capture** | [worksheet.ts](../mobile/src/lib/worksheet.ts), [CaptureScreen.tsx](../mobile/src/screens/CaptureScreen.tsx) | Camera, library, PDF. Long-edge downscale to 1568px. Difficulty selector. |
| **F2 Batch generation** | [api/app/api/](../api/app/api/) | Four stages, Zod-validated, malformed groups dropped, <3 valid → error → client fallback. Run for real on [fixtures/worksheet.jpg](../api/fixtures/worksheet.jpg). |
| **F3 Batch player** | [BatchPlayerScreen.tsx](../mobile/src/screens/BatchPlayerScreen.tsx) | Vertical paging, scroll lock, clip-end auto-advance (latched), read-length fallback, `playsInSilentMode`, start-from-tap, mute, dots, prefetch. |
| **F4 ScoreCard** | [ScoreCardPage.tsx](../mobile/src/components/ScoreCardPage.tsx) | Confetti, score, **streak**, subject chips, banded encouragement, Make it harder + Done. |
| **F5 Recording** | [history.ts](../mobile/src/lib/history.ts) | ARCH §5 shape field-for-field. Repeat plays each get a row. |
| **F6 Status narration** | [GeneratingScreen.tsx](../mobile/src/screens/GeneratingScreen.tsx) | Driven by real `StageId` transitions. |

**Agent swarm (PRD §4)** — all seven run for real: Orchestrator, Extractor,
Researcher swarm (3 parallel, `web_search` live), Curriculum Planner, Lesson
Writers ‖ Quiz Writers, Encourager.

**Latency (PRD §10, <45s).** 172.5s → ~41s. Where it went: two of three
researchers were silently failing validation (returning 7 concepts against a
`.max(6)`, so the whole topic was discarded — the 133s bought one topic's
research out of three); each `web_search` round is another model turn, so
searches were cut 3 → 1; researcher output 1300 → 400 tokens; extract and
planner effort dropped a tier. A soft deadline now caps the research tail.
No part of ARCH §6's cut order was invoked — live research survives.

**Assets 8/8 and 8/8.** The 10/12 images and 11/12 audio in the first real run
were provider **429s** from the unthrottled `Promise.all` fan-out, not content
failures. Fixed with a 4-in-flight pool per provider plus one jittered retry
gated on 429/5xx. The stage got faster, not slower (3.3s → ~2s).

**Answer-key correctness — half fixed, and know which half.** The first real
batch shipped a *wrong* `order` key: it graded 2/5 before 3/8, and said so in
the explanation. The *bookkeeping* is now correct by construction — quiz writers
emit `order` items already in sequence with no key at all, and `/api/compose`
scrambles them and derives `correctOrder` from its own scramble, so the key is a
fact about what the server did rather than a claim about a list the model
shuffled in its head.

The *semantics* still rest on the writer's list, and a second wrong key reached
the bundled batch before review caught it: a water-cycle question whose items
formed a correct cycle **started at the wrong point** (condensation, not the
evaporation its own prompt and explanation pinned). Cyclic sequences are the
weak spot — every rotation looks right in isolation. Note the prompt *already*
pinned the start with a situation ("a lake sits under the afternoon sun") and
the writer rotated the items anyway, so treat that mitigation as necessary but
not sufficient. The bundled key is patched, but nothing validates order
semantics automatically: `checkQuestion` only asserts `correctOrder` is a
permutation, which a rotation satisfies.
**Hand-check every `order` key after a re-bundle.** That is the control that
works.

**Difficulty calibration (PRD §10).** The first real Challenge batch was not
harder than On-level — it asked `1/5 + 2/5` where On-level asked `3/8 + 4/8`,
and its slider handed the child a hint. The rubric is now written as operation
counts and prohibitions rather than adjectives, in `DIFFICULTY_RUBRIC`, and
threaded through every downstream agent.

**Demo insurance bundled.** `validate:fallbacks` reports **8/8 bundled clips**
on both batches — 32 real fal illustrations and ElevenLabs clips, 7.2MB, all
resolving through Metro (verified with `expo export`). Automated by
[bundle:fallbacks](../api/scripts/bundle-fallbacks.ts).

**Audio hosting.** `hostAudio` is now three tiers: Blob token → Vercel Blob;
else the request `Host` → in-process store served from `GET /api/audio/<id>`;
else the old base64 data URI. The phone gets a real `http://` URL over the LAN,
so the batch is no longer silent on iPhone.

**Chime.** ARCH §4's "correct → mini confetti + chime" — the chime existed
nowhere; it is now a bundled 400ms WAV on its own player, muted with the batch.

---

## Added after the conformance pass — more movement on screen

**Karaoke narration.** The slide now draws `narration` — the words being spoken
— instead of the short written `caption`, and lights each word as the voice
reaches it. Timings are real: ElevenLabs' `with-timestamps` endpoint returns a
character-level alignment that S4 folds into `narrationWords` (ARCH §3). We read
`alignment`, not `normalized_alignment`, because the latter is what the model
*spoke* (it rewrites em dashes, collapses spaces) while the karaoke highlights
what is *on screen*. A clip with no timings renders statically rather than
guessing — a highlight drifting out of sync reads as broken; static text does
not. Every word is the same size and weight and differs only in colour, so
lighting one cannot change a glyph's advance width and the text can never
reflow. Sampling is 10Hz and the derived word index is pushed only when it
changes, so ~40 renders per clip, in one component.

**2.5D parallax.** Image, gradient plate and text sit on separate layers moving
at different rates against device tilt (`expo-sensors`, low-pass filtered,
clamped) and against pager scroll. One sensor subscription for the whole screen
— eight slides are mounted at once — and every transform on the native driver.
Ken Burns keeps running underneath. The translation budget is bounded by the
Ken Burns overscan at its *smallest* scale, which is why the loop now runs at
1.10×: it also fixed a pre-existing bug where `pan-left`/`pan-right` translated
further than the image hid, showing a sliver of tint at each extreme.

**Art direction.** The flat style-lock is replaced by a prose description of the
supplied reference illustration — painterly, saturated, softly shaded, clean
sky-blue grounds. A true image reference was investigated and **rejected on
merit**: `flux/schnell/redux` takes no prompt at all (so every slide would
ignore its own scene), and `flux/dev/image-to-image` contaminated content —
it drew the reference's sunflower growing out of an unrelated jar. It survives
behind `ZING_IMAGE_REF`, default off. Asking for a *painting* also cost two new
rails — `no border`, `no signature` — because schnell started signing its work.

**Upload caching.** A generated batch is cached against the hash of the bytes
actually uploaded, plus difficulty. A repeat submission replays in under two
seconds instead of ~45. A hit is served only after probing that its media is
still alive, so a restarted dev server or a changed LAN IP forces a real run
rather than playing dead links — a hit is never worse than a miss. The swarm
narration still runs, at ~4% cadence: it is the evidence for the pitch, and
cutting straight to a playing feed reads as a bug rather than as speed.
**A fresh camera snap never hits** — new bytes. Replays must come from the
library or the PDF (noted in [DEMO.md](DEMO.md)).

**Two new dead-end guards**, both found by hand-checking a real batch:
- A `multi` whose options are *all* correct grades "tap everything" as perfect.
  One shipped. Now malformed, and dropped like any other bad question.
- A `slider` whose keyed value no step can land on is unanswerable however well
  the child reasons. One nearly shipped: `step: 12` with a key of 88 ±3 accepts
  85–91, and the reachable stops are 84 and 96. Now validated.

---

## Open — needs a human

### 1. Full rehearsal on the phone (ARCH §6, 2:40–3:00)

**The one thing that cannot be done from here.** Every layer has been verified
except the one that matters most: no part of this app has ever rendered on a
physical device. The bundle is clean and the media resolves, but prefetch
behaviour on venue Wi-Fi, the silent switch, scroll feel, and whether the
ScoreCard beat lands are all unmeasured.

The checklist is written up in [DEMO.md](DEMO.md). Run it twice.

### 2. Vercel deployment — deliberately not done

**Decision taken: stay local.** [scripts/dev.ps1](../scripts/dev.ps1) serves the
API on the LAN and that is what the demo will use. This is a conscious deviation
from PRD §2, which lists a Vercel backend as a demo constraint.

What it costs: the phone must be on the same network as the laptop, so venue
Wi-Fi becomes load-bearing (have the laptop hotspot ready). What it saves: the
HTTPS/ATS question, deployment protection, and a token nobody has.

If that reverses, note that the in-process audio store does **not** survive a
serverless cold start — a deployment needs `BLOB_READ_WRITE_TOKEN` set, or the
batch goes silent again.

---

## Known gaps, deliberately not closed

- **Compose exceeds its own ARCH §2 allocation** (~15-17s against 12s). The gate
  PRD §10 actually sets is the *total*, which passes. The per-stage budgets in
  [smoke.ts](../api/scripts/smoke.ts) were left honest rather than relaxed to
  make the output green.
- **"~2 min total narration" is a Planner instruction, not a check.** PRD §3
  calls it Planner-enforced and ARCH §2.S3 now lists it, but nothing sums
  `narration` word counts. Current batches measure ~2.3 min, so it is not
  currently binding.
- **`GET /api/fallback` is unreachable from the app** — the bundled JSON is the
  stronger insurance (it needs no API). Kept as a dev endpoint, annotated in
  ARCH §1. Note the bundled *media* is not offline under Expo Go:
  `Image.resolveAssetSource` hands back Metro URLs, so a dead network degrades
  the fallback to captions-on-tint and silence. It still plays.
- **≥3 distinct question types no longer fails a batch.** It was in
  `BatchSpec.superRefine`, so four sound questions using two widgets 502'd the
  whole compose stage into the fallback — which ARCH §2.S3 never promised. It is
  now a logged warning. `<3 valid questions → error` is unchanged.
- **`validate:fallbacks` checks packaging, not correctness.** It verifies schema,
  counts, types and that a clip exists on disk for every slide. It cannot see a
  wrong answer key — see the note above.
- **One lesson per group.** PRD used to say 1–3; the pipeline has always built
  exactly one. PRD §3 now matches the code rather than the code chasing the doc.

## Not gaps — intentional, do not "fix"

- **`LIVE_MAKE_IT_HARDER = false`** ([api.ts](../mobile/src/lib/api.ts)). ARCH §5
  pre-cuts Make-it-harder to the cached Challenge batch. The live path exists
  behind the flag.
- **Expo SDK pinned to 54.** iOS Expo Go is frozen at 54.0.2 and cannot open an
  SDK 55+ project. Do not upgrade without moving to development builds.
- **No CORS headers.** Expo Go's native fetch isn't subject to CORS.
- **Fallback media keys are variant-prefixed** (`b-` / `c-`). Both batches read
  one `bundledMedia` map; without the prefix the Challenge batch would replay
  the on-level illustrations and narration.
