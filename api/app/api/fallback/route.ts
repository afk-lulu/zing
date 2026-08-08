import fallbackBatch from '@/data/fallback-batch.json';
import { fail, ok } from '@/lib/http';
import { BatchSpec } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

/**
 * The cached demo batch (ARCH §1). This is the network-side insurance: it
 * carries no `imageUrl`/`audioUrl`, because fal and ElevenLabs URLs expire and
 * a link that 404s on stage is worse than no link — the app renders it with
 * captions over its own gradient.
 *
 * The offline insurance is separate and lives in the app:
 * `mobile/src/assets/fallback/batch.json` plus bundled image and audio files.
 */
export function GET() {
  try {
    // Validated on the way out so a hand-edited demo batch can never ship broken.
    return ok({ batch: BatchSpec.parse(fallbackBatch) });
  } catch (error) {
    return fail(error, 'fallback');
  }
}
