import { Image } from 'react-native';
import type { BatchSpec, Difficulty } from '../types/batch';
import { getChallengeBatch, getFallbackBatch } from './fallback';

/**
 * The app is the Orchestrator's hands (ARCH §1): it calls the four stages in
 * sequence, passes each output forward, narrates progress, enforces the 90s
 * cap, and drops to the bundled fallback batch on any failure.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_ZING_API_URL ?? '').replace(/\/+$/, '');

/** ARCH §5 — any stage error, or >90s total, means fallback. */
export const PIPELINE_DEADLINE_MS = 90_000;

export type StageId = 'extract' | 'research' | 'compose' | 'assets' | 'ready';

/** What the Generating screen reads out. Real progress, not a fake timeline. */
export const STAGE_SCRIPT: { id: StageId; agent: string; line: string }[] = [
  { id: 'extract', agent: 'Extractor', line: 'Reading your worksheet…' },
  { id: 'research', agent: 'Researcher swarm', line: 'Looking up how this is taught…' },
  { id: 'compose', agent: 'Planner + Writers', line: 'Writing your lessons and questions…' },
  { id: 'assets', agent: 'Illustrator + Narrator', line: 'Drawing the pictures and recording your teacher…' },
  { id: 'ready', agent: 'Zing', line: 'Your batch is ready!' },
];

export interface WorksheetSource {
  kind: 'image' | 'pdf';
  /** Base64, no data-URI prefix. */
  data: string;
  /** Required for `image`, e.g. "image/jpeg". */
  mediaType?: string;
}

export interface PipelineResult {
  batch: BatchSpec;
  /** True when the child is looking at the bundled batch, not a fresh one. */
  usedFallback: boolean;
  /** Kept so **Make it harder** can re-run compose+assets at level+1. */
  context?: { extraction: unknown; research: unknown };
}

export interface RunPipelineOptions {
  source: WorksheetSource;
  difficulty: Difficulty;
  onStage?: (stage: StageId) => void;
}

class HttpError extends Error {}

async function postStage<T>(stage: string, body: unknown, signal: AbortSignal): Promise<T> {
  if (!BASE_URL) {
    throw new HttpError('EXPO_PUBLIC_ZING_API_URL is not set');
  }

  const response = await fetch(`${BASE_URL}/api/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = String(response.status);
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      // keep the status code
    }
    throw new HttpError(`${stage} failed: ${detail}`);
  }

  return (await response.json()) as T;
}

/**
 * Prefetches every slide image the moment S4 returns (ARCH §4), so the first
 * page is already decoded when the child taps to start and the feed never
 * stutters on venue Wi-Fi.
 */
export function prefetchSlideImages(batch: BatchSpec): void {
  for (const group of batch.groups) {
    for (const lesson of group.lessons) {
      for (const slide of lesson.slides) {
        if (slide.imageUrl?.startsWith('http')) {
          Image.prefetch(slide.imageUrl).catch(() => {
            // A failed prefetch just means the <Image> fetches it later.
          });
        }
      }
    }
  }
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const { source, difficulty, onStage } = options;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PIPELINE_DEADLINE_MS);

  try {
    const sourceBody =
      source.kind === 'pdf'
        ? { pdf: { data: source.data } }
        : { image: { mediaType: source.mediaType ?? 'image/jpeg', data: source.data } };

    onStage?.('extract');
    const { extraction } = await postStage<{ extraction: unknown }>(
      'extract',
      { ...sourceBody, difficulty },
      controller.signal,
    );

    onStage?.('research');
    const { research } = await postStage<{ research: unknown }>(
      'research',
      { extraction, difficulty },
      controller.signal,
    );

    onStage?.('compose');
    const { batch: composed } = await postStage<{ batch: BatchSpec }>(
      'compose',
      { extraction, research, difficulty },
      controller.signal,
    );

    onStage?.('assets');
    const { batch } = await postStage<{ batch: BatchSpec }>(
      'assets',
      { batch: composed },
      controller.signal,
    );

    prefetchSlideImages(batch);
    onStage?.('ready');
    return { batch, usedFallback: false, context: { extraction, research } };
  } catch (error) {
    console.warn('[zing] pipeline fell back —', error instanceof Error ? error.message : error);
    onStage?.('ready');
    return { batch: getFallbackBatch(difficulty), usedFallback: true };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * ARCH §5 — **Make it harder** is pre-cut to the cached Challenge batch for the
 * demo. The live path (compose + assets at level+1, reusing the extraction and
 * research we already paid for) is implemented below but off the critical path;
 * flip this to try it.
 */
export const LIVE_MAKE_IT_HARDER = false;

export async function makeItHarder(previous: PipelineResult): Promise<PipelineResult> {
  if (!LIVE_MAKE_IT_HARDER || !previous.context) {
    return { batch: getChallengeBatch(), usedFallback: true };
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PIPELINE_DEADLINE_MS);

  try {
    const { batch: composed } = await postStage<{ batch: BatchSpec }>(
      'compose',
      { ...previous.context, difficulty: 'challenge' as Difficulty },
      controller.signal,
    );
    const { batch } = await postStage<{ batch: BatchSpec }>(
      'assets',
      { batch: composed },
      controller.signal,
    );
    prefetchSlideImages(batch);
    return { batch, usedFallback: false, context: previous.context };
  } catch (error) {
    console.warn('[zing] make-it-harder fell back —', error instanceof Error ? error.message : error);
    return { batch: getChallengeBatch(), usedFallback: true };
  } finally {
    clearTimeout(deadline);
  }
}
