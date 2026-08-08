import type { NarrationWord, Slide } from '../types/batch';

/**
 * The narration a lesson slide should show, split into the tokens the karaoke
 * highlight moves across.
 */
export interface SlideNarration {
  /** Display tokens, in order. Rendered with single spaces between them. */
  words: string[];
  /**
   * Per-word timings aligned to `words` by index, or `null` when the batch has
   * none — an older bundled batch, or a run where TTS timestamps failed.
   */
  timings: NarrationWord[] | null;
}

/**
 * ARCH §3 keeps `narration` in the spec after S4 has consumed it, so the player
 * can show the words the teacher voice is actually saying rather than the
 * one-line `caption` summary. `caption` stays as the last resort for the case
 * where a writer returned an empty narration.
 */
export function slideNarration(slide: Slide): SlideNarration {
  const narration = slide.narration?.trim() ?? '';
  if (!narration) return { words: tokenize(slide.caption), timings: null };

  const timings = slide.narrationWords;
  if (!timings || timings.length === 0) return { words: tokenize(narration), timings: null };

  // `NarrationWord.word` is the display token including trailing punctuation
  // (see `types/batch.ts`), so the timed tokens *are* the narration. Taking
  // them rather than re-splitting the string is what guarantees the highlight
  // index and the rendered word can never drift apart.
  return { words: timings.map((timed) => timed.word), timings };
}

function tokenize(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * Index of the last word whose start has passed, or `-1` before the first one.
 *
 * A word stays current until the *next* one starts rather than dropping out at
 * its own `endMs`, so the highlight rides through the pauses between sentences
 * instead of blinking off at every full stop.
 *
 * Binary search, not a walk from the last index: it costs ~6 comparisons on a
 * 50-word narration and it is still correct if the clip is ever seeked or
 * replaced under us.
 */
export function wordIndexAt(words: NarrationWord[], positionMs: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (words[mid].startMs <= positionMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

/**
 * The bridge between the audio player (which reports a position several times a
 * second) and the narration (which changes word a few dozen times a clip).
 *
 * `BatchPlayerScreen` owns one of these and pushes an index at it on every
 * status tick; `setIndex` drops the ticks that land on the same word, so the
 * subscribed `<Text>` nodes re-render only when the highlight actually moves.
 */
export interface NarrationClock {
  getIndex(): number;
  setIndex(next: number): void;
  subscribe(onChange: () => void): () => void;
}

export function createNarrationClock(): NarrationClock {
  let index = -1;
  const listeners = new Set<() => void>();

  return {
    getIndex: () => index,

    setIndex(next: number) {
      if (next === index) return;
      index = next;
      for (const listener of listeners) listener();
    },

    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}
