import { Image } from 'react-native';
import type { BatchSpec, Difficulty } from '../types/batch';
import fallbackBatch from '../assets/fallback/batch.json';
import fallbackChallengeBatch from '../assets/fallback/challenge-batch.json';

/**
 * The offline insurance (ARCH §5). Bundled in the app, so it survives venue
 * Wi-Fi dying, a stage erroring, and the 90s cap firing.
 */

/**
 * Rehearsal media, bundled as files rather than links because fal and
 * ElevenLabs URLs expire (ARCH §5).
 *
 * Metro resolves `require()` at build time from a literal path, so each asset
 * has to be listed here by hand. Keys are `g<groupIndex>-s<slideIndex>`,
 * matching the page keys in `pages.ts`.
 *
 * Empty by default: with no entries the fallback batch plays as captions over
 * a tinted gradient, silent, auto-advancing on a timer. See
 * `../assets/fallback/README.md` for the pre-demo step that fills this in.
 */
const bundledMedia: Record<string, { image?: number; audio?: number }> = {
  // 'g0-s0': { image: require('../assets/fallback/g0-s0.png'), audio: require('../assets/fallback/g0-s0.mp3') },
};

/** Resolves bundled `require()` handles into URIs the player can use directly. */
function attachBundledMedia(batch: BatchSpec): BatchSpec {
  let hasAny = false;

  const groups = batch.groups.map((group, groupIndex) => {
    let slideIndex = 0;
    const lessons = group.lessons.map((lesson) => ({
      slides: lesson.slides.map((slide) => {
        const media = bundledMedia[`g${groupIndex}-s${slideIndex++}`];
        if (!media) return slide;
        hasAny = true;
        return {
          ...slide,
          imageUrl: media.image ? Image.resolveAssetSource(media.image).uri : slide.imageUrl,
          audioUrl: media.audio ? Image.resolveAssetSource(media.audio).uri : slide.audioUrl,
        };
      }),
    }));
    return { ...group, lessons };
  });

  return hasAny ? { ...batch, groups } : batch;
}

export function getFallbackBatch(difficulty: Difficulty = 'on-level'): BatchSpec {
  const source = difficulty === 'challenge' ? fallbackChallengeBatch : fallbackBatch;
  return attachBundledMedia(source as BatchSpec);
}

/**
 * The pre-cached Challenge batch **Make it harder** serves on the demo path
 * (ARCH §5) — same worksheet, level+1, generated at rehearsal.
 */
export function getChallengeBatch(): BatchSpec {
  return getFallbackBatch('challenge');
}
