# Bundled fallback batches

Insurance for the demo (ARCH §5 and §7). Any pipeline stage erroring — or the
whole run passing 90s — drops the app here instead of showing the child a
spinner that never ends.

- `batch.json` — the rehearsal batch, on-level.
- `challenge-batch.json` — the pre-cached Challenge batch that **Make it harder**
  serves on the demo path (ARCH §5).

Both ship **without** `imageUrl` / `audioUrl`, and both play fine that way: the
player renders each caption over a tinted gradient and auto-advances on a timer
instead of on clip end.

## Before the demo: bundle the real media

fal and ElevenLabs URLs expire, so the fix is to save the *files*, not the links
(ARCH §5). At the rehearsal step (ARCH §6, 2:25–2:40):

1. Run the pipeline once cleanly on the demo worksheet:
   `cd api && npm run smoke -- ./worksheet.jpg on-level`
   then again with `challenge`.
2. Download every `imageUrl` and `audioUrl` from the resulting `batch-*.json`
   into this folder, e.g. `g0-s0.png` / `g0-s0.mp3`.
3. Replace the batch JSON here with the fresh spec, dropping the now-dead URLs.
4. Register the downloaded files in `bundledMedia` in `../../lib/fallback.ts` —
   Metro needs a literal `require()` per asset, so they cannot be resolved from
   a string at runtime.
