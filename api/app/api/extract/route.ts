import { z } from 'zod';
import { askJson, imageBlock, pdfBlock, textBlock } from '@/lib/claude';
import { EXTRACTOR_SYSTEM, extractorUser } from '@/lib/prompts';
import { StageError, fail, ok, readBody } from '@/lib/http';
import { Difficulty, Extraction } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

const RequestBody = z
  .object({
    difficulty: Difficulty,
    image: z
      .object({
        mediaType: z.enum(IMAGE_MEDIA_TYPES),
        /** Base64, no data-URI prefix. */
        data: z.string().min(1),
      })
      .optional(),
    pdf: z.object({ data: z.string().min(1) }).optional(),
  })
  .refine((body) => Boolean(body.image) !== Boolean(body.pdf), {
    message: 'provide exactly one of `image` or `pdf`',
  });

/**
 * S1 — Extractor. One Claude call over the photo or the native PDF: subjects,
 * concrete problems, grade-band estimate, handwriting best-guess (ARCH §2.S1).
 */
export async function POST(request: Request) {
  try {
    const body = await readBody(request, RequestBody);

    const source = body.image
      ? imageBlock(body.image.mediaType, body.image.data)
      : pdfBlock(body.pdf!.data);

    const extraction = await askJson({
      agent: 'extractor',
      system: EXTRACTOR_SYSTEM,
      user: [source, textBlock(extractorUser(body.difficulty))],
      schema: Extraction,
      // Vision at `medium` cost ~12s against an 8s budget, and this stage is
      // identifying topics, not transcribing (ARCH §2.S1) — a job `low` does
      // as well in half the time.
      effort: 'low',
      maxTokens: 1024,
    });

    return ok({ extraction });
  } catch (error) {
    return fail(error instanceof StageError ? error : error, 'extract');
  }
}
