/**
 * CLI driver for the pipeline (ARCH §6, 0:20-1:10 — "CLI-test on the demo
 * worksheet until one good batch emerges"). Runs S1 → S4 against a running
 * dev server, prints per-stage timings against the ARCH §2 latency budget, and
 * writes the finished Batch Spec to disk.
 *
 *   npm run dev                                     # in one terminal
 *   npm run smoke -- ./worksheet.jpg on-level       # in another
 *
 * Pass a .pdf and it goes down the document path instead of the vision path.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { extname, basename } from 'node:path';

const BASE_URL = process.env.ZING_API_URL ?? 'http://localhost:3000';

const BUDGETS_MS: Record<string, number> = {
  extract: 8_000,
  research: 15_000,
  compose: 12_000,
  assets: 15_000,
};

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

async function callStage<T>(stage: string, body: unknown): Promise<T> {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}/api/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - started;

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${stage} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const budget = BUDGETS_MS[stage];
  const verdict = elapsed <= budget ? 'ok' : 'OVER BUDGET';
  console.log(`  ${stage.padEnd(9)} ${String(elapsed).padStart(6)}ms  (budget ${budget}ms — ${verdict})`);
  return payload as T;
}

async function main() {
  const [inputPath, difficultyArg] = process.argv.slice(2);
  if (!inputPath) {
    console.error('usage: npm run smoke -- <worksheet.jpg|worksheet.pdf> [easy|on-level|challenge]');
    process.exit(1);
  }
  const difficulty = difficultyArg ?? 'on-level';

  const bytes = await readFile(inputPath);
  const data = bytes.toString('base64');
  const extension = extname(inputPath).toLowerCase();

  const source =
    extension === '.pdf'
      ? { pdf: { data } }
      : { image: { mediaType: IMAGE_MEDIA_TYPES[extension] ?? 'image/jpeg', data } };

  console.log(`\nzing pipeline — ${basename(inputPath)} @ ${difficulty}\n`);
  const wallClockStart = Date.now();

  const { extraction } = await callStage<{ extraction: ExtractionLike }>('extract', {
    ...source,
    difficulty,
  });
  const { research } = await callStage<{ research: ResearchLike }>('research', {
    extraction,
    difficulty,
  });
  // S2 deadlines slow researchers (see /api/research). A topic that misses it is
  // omitted, so this is where a thinner-than-planned batch first shows up.
  console.log(
    `  ${'researched'.padEnd(9)} ${String(research.topics.length).padStart(6)}/${extraction.topics.length} topics`,
  );
  const { batch } = await callStage<{ batch: BatchLike }>('compose', { extraction, research, difficulty });
  const { batch: withAssets } = await callStage<{ batch: BatchLike }>('assets', { batch });

  const total = Date.now() - wallClockStart;
  const slides = withAssets.groups.flatMap((g) => g.lessons.flatMap((l) => l.slides));

  console.log(`\n  total     ${String(total).padStart(6)}ms  (ARCH §2 target: batch starts <45000ms)\n`);
  console.log(`  ${withAssets.topicSummary}`);
  console.log(`  subjects:  ${withAssets.subjects.join(', ')}`);
  console.log(`  groups:    ${withAssets.groups.length}`);
  console.log(`  questions: ${withAssets.groups.map((g) => g.quiz.type).join(', ')}`);
  console.log(`  slides:    ${slides.length}`);
  console.log(`  images:    ${slides.filter((s) => s.imageUrl).length}/${slides.length}`);
  console.log(`  audio:     ${slides.filter((s) => s.audioUrl).length}/${slides.length}`);

  const outPath = `batch-${withAssets.difficulty}.json`;
  await writeFile(outPath, JSON.stringify(withAssets, null, 2));
  console.log(`\n  written to ${outPath}\n`);
}

interface ExtractionLike {
  topics: { topic: string }[];
}

interface ResearchLike {
  topics: { topic: string }[];
}

interface BatchLike {
  topicSummary: string;
  subjects: string[];
  difficulty: string;
  groups: {
    lessons: { slides: { imageUrl?: string; audioUrl?: string }[] }[];
    quiz: { type: string };
  }[];
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
