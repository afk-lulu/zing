# Zing — demo rehearsal

The PRD §9 script, turned into something you can actually run twice before the
judges arrive. ARCH §6 allots 2:40–3:00 to this; treat it as the last gate, not
a nicety — it is the only step that catches prefetch behaviour on venue Wi-Fi,
the silent switch, and the ScoreCard beat landing late.

---

## T-30 — bring the stack up

```sh
# Windows
.\scripts\dev.ps1            # api on :3000 + Metro, both bound to the LAN IP
```

Backend is **local, not Vercel** — a deliberate deviation from PRD §2, recorded
in [TODO.md](TODO.md). The consequence for the demo: the phone must stay on the
same network as the laptop, so the venue Wi-Fi is now load-bearing. Have the
laptop's hotspot ready as the fallback network.

Checks before you touch the phone:

```sh
cd api
curl -s localhost:3000/api/fallback | head -c 200     # cached batch serves
npm run validate:fallbacks                            # 8/8 bundled clips, not 0/8
```

`EXPO_PUBLIC_ZING_API_URL` in `mobile/.env` must be the laptop's **LAN IP**, not
`localhost` — the phone cannot reach localhost. Restart Metro after editing it;
the value is baked in at bundle time.

## T-25 — check these three first

Nothing in this app has ever rendered on a device. These are the three things
most likely to be wrong, in the order they will bite:

1. **Slide → quiz auto-advance.** When narration ends on the last slide of a
   group, the player animates to the quiz page and locks scrolling at the same
   moment. On iOS, disabling `scrollEnabled` mid-animation can cancel the
   animation — leaving the feed on the slide while the player believes it is on
   the quiz, with scrolling locked. That is a dead end, and it is on the path
   four times per batch. **Watch one full group play through to its quiz without
   touching the screen.** If it wedges, the fix is to drive the lock from
   `onMomentumScrollEnd` rather than from the index, in
   [BatchPlayerScreen.tsx](../mobile/src/screens/BatchPlayerScreen.tsx).
2. **Audio actually plays.** Clips are served over plain `http://` from the
   laptop. Expo Go should permit it, but it has never been played on a phone.
3. **Swiping off an answered quiz.** The quiz card is a scroll view inside the
   pager; on the taller Challenge questions, swiping *inside the card* scrolls
   the card rather than advancing the feed. Swipe from the strip above it.

## T-20 — one clean live run

Snap the demo worksheet, On-level, all the way to the ScoreCard. You are looking
for four numbers and one feeling:

| Check | Pass |
|---|---|
| Batch starts | < 45s (PRD §10; 90s is the fallback cap, not the target) |
| Question types | ≥ 3 distinct across the batch |
| Images | every slide illustrated, no text/glyph garbage in any image |
| Audio | narration audible **with the ring/silent switch set to silent** |
| Feel | no jank on the pager, no dead ends |

If audio is silent, in order of likelihood: the phone's silent switch (the app
sets `playsInSilentMode`, but only after the first tap), or the `http://` clips
being refused on the device. Not `data:` URIs — on the local path a `Host`
header is always present, so that tier cannot be reached. See the Audio hosting
section of the [README](../README.md).

## T-10 — the script (PRD §9)

1. **"This is real homework."** → snap → On-level.
2. Talk the swarm over the Generating screen (~30s). Name each agent as its
   stage lights up — the narration is driven by real stage transitions, so the
   words match what the backend is actually doing. Do not rush this; it is the
   pitch's backbone (PRD §4).
3. Batch plays: two lessons **with sound up**, answer a slider question live,
   one more lesson, then **deliberately miss an order question** to show the
   shake + correct-answer highlight + explanation.
4. Finish the remaining questions fast → **ScoreCard confetti**. Hold on this
   screen. It is the closing image the judges keep (PRD §9.4).
5. **Make it harder** → flash one visibly tougher question (cached Challenge
   batch, ARCH §5) → flash History.

## T-5 — freeze

Stop editing. Re-run the app once from a cold start (kill Metro, `npx expo
start`, rescan) so the first thing the judges see is not a stale bundle.

---

## If it breaks on stage

| Symptom | What to do |
|---|---|
| Generating hangs | It self-caps at 90s and drops to the bundled batch. Keep talking — the fallback plays identically, images and audio included. |
| Wi-Fi dies mid-run | Same path — the fallback spec is bundled and needs no API. Under Expo Go its media still streams from Metro, so a fully dead network means captions on tint, silent, auto-advancing. It plays; it just plays quiet. |
| Batch plays silent | Keep going, read a caption aloud. Slides auto-advance on the read-length timer, so the pacing survives. |
| A slide shows a caption on a plain tint | fal failed for that slide only. The batch is still valid; do not restart. |
| Anything else | **Do not restart the app on stage.** Swipe forward to the ScoreCard and land the confetti beat. |

The one rule: every failure path in this app is designed to be invisible if you
don't announce it. Don't announce it.
