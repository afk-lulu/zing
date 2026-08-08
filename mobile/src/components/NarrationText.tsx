import { memo, useCallback, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, type } from '../theme';
import type { NarrationClock } from '../lib/narration';

interface Props {
  /** Display tokens from `slideNarration`. */
  words: string[];
  /**
   * The screen's clock while this page is the one playing, `null` on every
   * other page — which is what stops the mounted-but-offscreen slides from
   * subscribing to a highlight that isn't theirs.
   */
  clock: NarrationClock | null;
  /** False when this slide has no per-word timings. */
  timed: boolean;
}

/** Past this many characters the block needs the tighter type step to stay clear
 *  of the HUD on a small phone — ~40 words of narration. */
const LONG_NARRATION_CHARS = 210;

/**
 * The narration, lit up word by word against the clip (PRD §3 "the teacher
 * voice"). Every word is the same family, size, weight and letter-spacing and
 * differs only in colour, so the highlight moving through the block cannot
 * change any word's measured width — the text never reflows or jitters.
 */
function NarrationTextImpl({ words, clock, timed }: Props) {
  // Subscribing through the clock rather than taking the index as a prop keeps
  // the position updates out of the parent's render path: only this component
  // re-renders, and only when the word actually changes.
  const subscribe = useCallback(
    (onChange: () => void) => (clock ? clock.subscribe(onChange) : NO_SUBSCRIPTION),
    [clock],
  );
  const getIndex = useCallback(() => (clock ? clock.getIndex() : -1), [clock]);
  const live = useSyncExternalStore(subscribe, getIndex);

  // No timings — an older bundled batch, or a run where the timestamps failed.
  // Every word reads as spoken and nothing moves. Estimating the timings would
  // drift against the clip within a sentence, and a highlight that drifts reads
  // as broken where a still block reads as a deliberate choice.
  const speaking = timed ? live : -1;
  const spokenThrough = timed ? live : words.length;

  const characters = words.reduce((total, word) => total + word.length + 1, 0);
  const step = characters > LONG_NARRATION_CHARS ? styles.long : styles.regular;

  return (
    <Text style={[styles.block, step]}>
      {words.map((word, i) => (
        <Text
          key={i}
          style={i === speaking ? styles.speaking : i < spokenThrough ? styles.spoken : styles.unspoken}
        >
          {i === 0 ? word : ` ${word}`}
        </Text>
      ))}
    </Text>
  );
}

const NO_SUBSCRIPTION = () => {};

export const NarrationText = memo(NarrationTextImpl);

const styles = StyleSheet.create({
  block: {
    // The shadow lives on the parent so every word inherits exactly the same
    // one; it is what carries the dim words over a bright illustration.
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  regular: { ...type.narration },
  long: { ...type.narrationLong },
  spoken: { color: colors.spoken },
  speaking: { color: colors.speaking },
  unspoken: { color: colors.unspoken },
});
