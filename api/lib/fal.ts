import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StageError, isRetryableStatus, requireEnv } from './http';
import { isMock, mockImageUrl } from './mock';

/**
 * fal.ai Flux **schnell** — the fast one. 720×1280 portrait so a slide fills a
 * phone screen edge to edge (ARCH §2.S4). ~2-4s per image, all fanned out in
 * parallel by the caller.
 */
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';

/**
 * Opt-in only — see `useStyleReference()`. Same Flux family, but **dev**, and it
 * takes a reference image alongside the prompt.
 */
const FAL_REFERENCE_ENDPOINT = 'https://fal.run/fal-ai/flux/dev/image-to-image';

export const IMAGE_WIDTH = 720;
export const IMAGE_HEIGHT = 1280;

/**
 * Style lock. Prefixed to every writer prompt so the whole batch looks like one
 * book, and repeating the no-text rule here catches any writer that let a label
 * slip through.
 *
 * It is prose, not tags, because "flat, colorful children's textbook
 * illustration, friendly" was too thin to steer with: schnell filled the gaps
 * with whatever it defaults to, which was clip-art one slide and stock
 * photography the next. This names the medium (airbrushed gouache), the light
 * (bright, even, no harsh shadows), the palette, the background treatment and
 * the amount of detail, so consecutive slides read as pages from one book —
 * the look of `fixtures/style-reference.jpg`.
 *
 * The closing clauses are the ARCH §7 rail and are not negotiable: every word a
 * child reads is a native RN overlay, so any glyph the model draws is garbage on
 * the screen. The last four are what asking for a *painting* costs — schnell
 * answers "painterly" with a scrawled artist's mark in the bottom corner, and
 * "paper grain" with a ragged white paper edge painted around the whole frame,
 * which on a full-screen slide reads as a rendering bug.
 *
 * No trailing period: the caller joins it to the scene with ". ".
 */
export const STYLE_PREFIX =
  'Painterly airbrushed illustration from a modern elementary-school science textbook: ' +
  'richly saturated colour, soft graded shading and gentle highlights, no hard outlines, ' +
  'bright even daylight with no harsh shadows; a crisp, generously detailed subject set ' +
  'against a clean uncluttered background — plain sky blue with a few soft white clouds ' +
  'wherever the scene allows — with open space around it; subtle paper grain, warm and ' +
  'friendly, painted full-bleed to the edges of the frame. No text, no letters, no numbers, ' +
  'no labels, no diagrams, no border, no frame, no watermark, no signature';

/**
 * `ZING_IMAGE_REF=1` swaps schnell for flux **dev** image-to-image conditioned on
 * `fixtures/style-reference.jpg`, so the art direction comes from the picture
 * rather than only from the words above.
 *
 * Off by default, and it should stay off. Measured against this reference:
 * schnell ~1.7s/image · dev image-to-image ~2.7s (~1.5s with `acceleration:
 * high`, at a visible quality cost) — so the latency is survivable, but the
 * conditioning leaks *subject matter*, not just style. A slide asking for a jar
 * of water on a windowsill came back with the reference's sunflower growing out
 * of it. In a teaching app the picture has to match the narration, so a prettier
 * frame that illustrates the wrong thing is a regression. The flag exists so the
 * finding can be re-checked, not because it is a good trade.
 *
 * The two endpoints that condition on an image *properly* were both timed and
 * both lose outright: `flux/schnell/redux` takes no `prompt` at all (each slide
 * needs its own scene), and `flux-general` costs 14.9s per image with an
 * IP-Adapter, or 10.9s with `reference_image_url` — either one spends the whole
 * S4 budget on a single slide.
 */
function useStyleReference(): boolean {
  const raw = process.env.ZING_IMAGE_REF?.toLowerCase().trim();
  return !!raw && raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * fal takes a data URI wherever it takes an image URL, which is the only option
 * here: `fixtures/` is not web-served, and uploading the reference somewhere on
 * every cold start would cost more than it saves. Read once and kept — the file
 * never changes within a process.
 */
let styleReference: Promise<string> | undefined;

function styleReferenceDataUri(): Promise<string> {
  styleReference ??= readFile(join(process.cwd(), 'fixtures', 'style-reference.jpg')).then(
    (bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`,
  );
  return styleReference;
}

interface FalImageResponse {
  images?: { url?: string }[];
  has_nsfw_concepts?: boolean[];
}

export async function generateSlideImage(imagePrompt: string, signal?: AbortSignal): Promise<string> {
  if (isMock()) return mockImageUrl();

  const prompt = `${STYLE_PREFIX}. ${imagePrompt}`;
  const reference = useStyleReference();

  const response = await fetch(reference ? FAL_REFERENCE_ENDPOINT : FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Key ${requireEnv('FAL_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      reference
        ? {
            prompt,
            // dev image-to-image has no `image_size`: it inherits the reference's
            // dimensions, which is why the committed file is already 720×1280.
            image_url: await styleReferenceDataUri(),
            // Near the top of the range — lower than this and the reference stops
            // being a style hint and starts being the composition.
            strength: 0.92,
            num_images: 1,
            num_inference_steps: 12,
            enable_safety_checker: true,
          }
        : {
            prompt,
            image_size: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
            num_images: 1,
            num_inference_steps: 4,
            enable_safety_checker: true,
          },
    ),
    signal,
  });

  if (!response.ok) {
    throw new StageError(
      `fal returned ${response.status}: ${await safeText(response)}`,
      502,
      'assets',
      isRetryableStatus(response.status),
    );
  }

  const body = (await response.json()) as FalImageResponse;
  const url = body.images?.[0]?.url;
  if (!url) throw new StageError('fal returned no image url', 502, 'assets');

  // The safety checker does not fail the request — it hands back a solid black
  // 720×1280 rectangle and a 200. Left alone that counts as a delivered image
  // and the app pages to a black screen, which looks far more broken than the
  // caption-over-gradient it degrades to when an image is simply absent
  // (ARCH §7). It fires on innocent prompts: an eight-slice cake with "a
  // friendly cartoon child" in the frame was blanked on one run and passed
  // clean on the next, so this is marked retryable — a re-roll on a fresh seed
  // usually clears it, and only a second blank gives up and drops the image.
  if (body.has_nsfw_concepts?.[0]) {
    throw new StageError('fal safety checker blanked the image', 502, 'assets', true);
  }
  return url;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '(no body)';
  }
}
