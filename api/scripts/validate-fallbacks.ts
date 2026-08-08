/**
 * Guards the hand-written demo batches. They are the ARCH §5 insurance, so a
 * typo in one of them is a demo that dies twice.
 *
 *   npm run validate:fallbacks
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BatchSpec, allSlides, countSlides } from '../lib/schema';

/** Relative to `api/`, which is where the npm script runs. */
const FILES = [
  'data/fallback-batch.json',
  '../mobile/src/assets/fallback/batch.json',
  '../mobile/src/assets/fallback/challenge-batch.json',
];

async function main() {
  let failed = false;

  for (const relative of FILES) {
    try {
      const raw = await readFile(resolve(process.cwd(), relative), 'utf8');
      const parsed = BatchSpec.safeParse(JSON.parse(raw));

      if (!parsed.success) {
        failed = true;
        console.error(`✗ ${relative}`);
        for (const issue of parsed.error.issues) {
          console.error(`    ${issue.path.join('.') || '(root)'}: ${issue.message}`);
        }
        continue;
      }

      const batch = parsed.data;
      const types = new Set(batch.groups.map((group) => group.quiz.type));
      const slides = allSlides(batch);
      console.log(
        `✓ ${relative} — ${batch.groups.length} groups, ${countSlides(batch)} slides, ` +
          `${types.size} question types (${[...types].join('/')}), ` +
          `${slides.filter((s) => s.audioUrl).length}/${slides.length} bundled clips`,
      );
    } catch (error) {
      failed = true;
      console.error(`✗ ${relative} — ${error instanceof Error ? error.message : error}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

void main();
