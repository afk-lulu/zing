/**
 * Guards the hand-written demo batches. They are the ARCH §5 insurance, so a
 * typo in one of them is a demo that dies twice.
 *
 *   npm run validate:fallbacks
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BatchSpec, countSlides } from '../lib/schema';

/** Relative to `api/`, which is where the npm script runs. */
const ASSET_DIR = '../mobile/src/assets/fallback';

/**
 * `bundled` marks the two specs the app ships. None of the three carries
 * `audioUrl` — the URLs expire, so the media is bundled as files and
 * re-attached by key at runtime (`mobile/src/lib/fallback.ts`). The clip count
 * therefore has to come off the disk, not out of the JSON.
 * `data/fallback-batch.json` is the network-side insurance and has no bundled
 * media by design.
 */
const FILES = [
  { path: 'data/fallback-batch.json', variant: null },
  { path: `${ASSET_DIR}/batch.json`, variant: 'b' },
  { path: `${ASSET_DIR}/challenge-batch.json`, variant: 'c' },
];

/**
 * Slide keys with an mp3 on disk — `<variant>-g<groupIndex>-s<slideIndex>`. The
 * variant (`b` on-level, `c` Challenge) keeps the two batches in separate key
 * spaces; without it the Challenge batch would replay the on-level media.
 */
async function bundledClipKeys(): Promise<Set<string>> {
  try {
    const names = await readdir(resolve(process.cwd(), ASSET_DIR));
    return new Set(
      names.filter((n) => /^[bc]-g\d+-s\d+\.mp3$/.test(n)).map((n) => n.replace(/\.mp3$/, '')),
    );
  } catch {
    return new Set();
  }
}

function slideKeys(batch: BatchSpec, variant: string): string[] {
  return batch.groups.flatMap((group, groupIndex) =>
    group.lessons
      .flatMap((lesson) => lesson.slides)
      .map((_, slideIndex) => `${variant}-g${groupIndex}-s${slideIndex}`),
  );
}

async function main() {
  let failed = false;
  const clips = await bundledClipKeys();

  for (const { path: relative, variant } of FILES) {
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
      const keys = variant ? slideKeys(batch, variant) : [];
      const media = variant
        ? `${keys.filter((key) => clips.has(key)).length}/${keys.length} bundled clips`
        : 'network-side (no bundled media)';
      console.log(
        `✓ ${relative} — ${batch.groups.length} groups, ${countSlides(batch)} slides, ` +
          `${types.size} question types (${[...types].join('/')}), ${media}`,
      );
    } catch (error) {
      failed = true;
      console.error(`✗ ${relative} — ${error instanceof Error ? error.message : error}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

void main();
