import { z } from 'zod';
import { generateSlideImage } from '@/lib/fal';
import { pickVoiceId, synthesizeNarration } from '@/lib/elevenlabs';
import { hostAudio } from '@/lib/blob';
import { StageError, fail, ok, readBody } from '@/lib/http';
import { resetMockCounters } from '@/lib/mock';
import { BatchSpec, MAX_IMAGES, allSlides } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RequestBody = z.object({ batch: BatchSpec });

/**
 * How many requests may be in flight per provider. ARCH §2.S4 says "full
 * fan-out", and the first real run showed what that costs: 12 slides fired 12
 * fal and 12 ElevenLabs calls at once and both providers shed load (2 images
 * and 1 clip lost to 429s). A pool this size still finishes the stage in a
 * couple of waves — the stage came in at 3.3s against a 15s budget, so the
 * headroom is there — while staying under the concurrency caps.
 */
const PROVIDER_CONCURRENCY = 4;

/** One retry, because a 429 that fails twice in a row is a real outage. */
const MAX_RETRIES = 1;
const RETRY_BASE_MS = 600;

/**
 * S4 — parallel fan-out, bounded per provider. Images and clips are two
 * independent pools that run against each other, so the stage costs roughly a
 * couple of image round-trips in wall clock rather than N of them (ARCH §2.S4).
 *
 * Assets degrade independently and silently: a slide whose image fails keeps
 * its caption over the app's gradient, and a slide whose clip fails plays
 * silent with the caption on screen — the batch still runs, which is the whole
 * point of the ARCH §7 "fal or ElevenLabs slow/down" mitigation.
 */
export async function POST(request: Request) {
  try {
    const { batch } = await readBody(request, RequestBody);
    resetMockCounters();

    const filled = structuredClone(batch);
    const slides = allSlides(filled);

    // One draw for the whole batch — the fan-out below is parallel, so picking
    // per slide would hand each slide a different teacher.
    const voiceId = pickVoiceId();
    console.log(`[zing:assets] narrator voice ${voiceId}`);

    // Without a Blob token the clips are served back from this same server, so
    // hostAudio needs the host the app reached us on to build a URL the phone
    // can follow (lib/blob.ts).
    const host = request.headers.get('host') ?? undefined;
    const started = Date.now();

    await Promise.all([
      mapWithLimit(slides, (slide, index) =>
        index < MAX_IMAGES
          ? attempt(`image ${index}`, async () => {
              slide.imageUrl = await generateSlideImage(slide.imagePrompt);
            })
          : Promise.resolve(),
      ),
      mapWithLimit(slides, (slide, index) =>
        attempt(`audio ${index}`, async () => {
          const bytes = await synthesizeNarration(slide.narration, voiceId);
          slide.audioUrl = await hostAudio(bytes, `${filled.batchId}-${index}`, host);
        }),
      ),
    ]);

    const images = slides.filter((slide) => slide.imageUrl).length;
    const audio = slides.filter((slide) => slide.audioUrl).length;
    console.log(
      `[zing:assets] ${Date.now() - started}ms · images ${images}/${slides.length} · audio ${audio}/${slides.length}`,
    );

    return ok({ batch: filled });
  } catch (error) {
    return fail(error, 'assets');
  }
}

/**
 * Runs `task` over every slide with at most PROVIDER_CONCURRENCY in flight.
 * Workers pull from a shared cursor rather than taking a fixed slice, so one
 * slow clip cannot leave a worker idle while another still has work queued.
 */
function mapWithLimit(
  slides: { imagePrompt: string; narration: string; imageUrl?: string; audioUrl?: string }[],
  task: (slide: (typeof slides)[number], index: number) => Promise<void>,
): Promise<unknown> {
  let cursor = 0;
  const worker = async () => {
    for (let index = cursor++; index < slides.length; index = cursor++) {
      await task(slides[index], index);
    }
  };
  return Promise.all(
    Array.from({ length: Math.min(PROVIDER_CONCURRENCY, slides.length) }, worker),
  );
}

/**
 * Runs one asset request, retrying only what is worth retrying. A 429 means the
 * provider is busy and a moment's wait fixes it; a rejected prompt or a bad key
 * will fail identically the second time, so those give up immediately and the
 * slide degrades.
 */
async function attempt(label: string, run: () => Promise<void>): Promise<void> {
  for (let tries = 0; ; tries++) {
    try {
      await run();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof StageError && error.retryable;

      if (!retryable || tries >= MAX_RETRIES) {
        console.error(`[zing:assets] ${label} failed — ${message}`);
        return;
      }
      // Jittered, so the whole wave does not come back in lockstep and trip the
      // same limit again.
      const backoff = RETRY_BASE_MS * (tries + 1) + Math.random() * RETRY_BASE_MS;
      console.warn(`[zing:assets] ${label} retrying in ${Math.round(backoff)}ms — ${message}`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
