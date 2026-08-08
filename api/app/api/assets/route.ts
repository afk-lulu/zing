import { z } from 'zod';
import { generateSlideImage } from '@/lib/fal';
import { synthesizeNarration } from '@/lib/elevenlabs';
import { hostAudio } from '@/lib/blob';
import { fail, ok, readBody } from '@/lib/http';
import { resetMockCounters } from '@/lib/mock';
import { BatchSpec, MAX_IMAGES, allSlides } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RequestBody = z.object({ batch: BatchSpec });

/**
 * S4 — full fan-out. Every slide's image and audio are requested at once, so
 * the stage costs roughly one image plus one clip in wall-clock, not N of each
 * (ARCH §2.S4).
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

    await Promise.all(
      slides.map(async (slide, index) => {
        const [imageUrl, audioUrl] = await Promise.all([
          index < MAX_IMAGES ? tryImage(slide.imagePrompt) : Promise.resolve(undefined),
          tryAudio(slide.narration, `${filled.batchId}-${index}`),
        ]);
        if (imageUrl) slide.imageUrl = imageUrl;
        if (audioUrl) slide.audioUrl = audioUrl;
      }),
    );

    return ok({ batch: filled });
  } catch (error) {
    return fail(error, 'assets');
  }
}

async function tryImage(imagePrompt: string): Promise<string | undefined> {
  try {
    return await generateSlideImage(imagePrompt);
  } catch (error) {
    console.error('[zing:assets] image failed —', error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function tryAudio(narration: string, name: string): Promise<string | undefined> {
  try {
    return await hostAudio(await synthesizeNarration(narration), name);
  } catch (error) {
    console.error('[zing:assets] audio failed —', error instanceof Error ? error.message : error);
    return undefined;
  }
}
