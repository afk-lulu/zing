import { StageError, requireEnv } from './http';
import { isMock, mockImageUrl } from './mock';

/**
 * fal.ai Flux **schnell** — the fast one. 720×1280 portrait so a slide fills a
 * phone screen edge to edge (ARCH §2.S4). ~2-4s per image, all fanned out in
 * parallel by the caller.
 */
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';

export const IMAGE_WIDTH = 720;
export const IMAGE_HEIGHT = 1280;

/**
 * Style lock. Prefixed to every writer prompt so the whole batch looks like one
 * book, and repeating the no-text rule here catches any writer that let a label
 * slip through.
 */
export const STYLE_PREFIX =
  "flat, colorful children's textbook illustration, friendly, no text, no letters, no numbers, no labels, no watermark";

interface FalImageResponse {
  images?: { url?: string }[];
}

export async function generateSlideImage(imagePrompt: string, signal?: AbortSignal): Promise<string> {
  if (isMock()) return mockImageUrl();

  const response = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Key ${requireEnv('FAL_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: `${STYLE_PREFIX}. ${imagePrompt}`,
      image_size: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      num_images: 1,
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new StageError(`fal returned ${response.status}: ${await safeText(response)}`, 502, 'assets');
  }

  const body = (await response.json()) as FalImageResponse;
  const url = body.images?.[0]?.url;
  if (!url) throw new StageError('fal returned no image url', 502, 'assets');
  return url;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '(no body)';
  }
}
