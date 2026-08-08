/**
 * One place for the look, so every page in the feed reads as the same app.
 *
 * Black ground, turquoise brand. The three answer signals are deliberately
 * three different hues — turquoise "you picked this", yellow "right", coral
 * "wrong" — so two of them can sit on screen together without reading as the
 * same state.
 */
export const colors = {
  bg: '#04070A',
  bgLift: '#0D1418',
  card: 'rgba(8, 14, 18, 0.92)',
  text: '#F2FBFA',
  textDim: 'rgba(242, 251, 250, 0.62)',
  accent: '#2BE5D0',
  accentSoft: 'rgba(43, 229, 208, 0.16)',
  /** Ink for label text and glyphs sitting *on* an `accent` or `correct` fill. */
  onAccent: '#03110F',
  correct: '#FFD447',
  correctSoft: 'rgba(255, 212, 71, 0.16)',
  wrong: '#FF6B5A',
  wrongSoft: 'rgba(255, 107, 90, 0.16)',
  hairline: 'rgba(242, 251, 250, 0.14)',

  // Karaoke narration (`NarrationText`). Three tiers that differ in **colour
  // only** — same family, size, weight and spacing — so a word lighting up
  // cannot change its own metrics and reflow the block underneath it.
  /** Already said. */
  spoken: 'rgba(242, 251, 250, 0.92)',
  /** Being said right now — the brightest thing on the slide. */
  speaking: '#6FF7E7',
  /** Still to come: recessed, never invisible. */
  unspoken: 'rgba(242, 251, 250, 0.48)',
} as const;

/** Confetti, so a celebration reads as this app and not as the library's default. */
export const confettiColors = [colors.accent, colors.correct, colors.wrong, colors.text] as string[];

/** Slide backdrop when a fal image is missing — captions still read cleanly. */
export const slideFallbackTints = ['#052C2C', '#0A2733', '#2E1611', '#2C2410', '#04211F'] as const;

export const radius = { sm: 10, md: 18, lg: 28, pill: 999 } as const;

/** Spreadable absolute fill. `StyleSheet.absoluteFillObject` is not typed in RN 0.86. */
export const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 36 } as const;

export const type = {
  caption: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  /**
   * The spoken narration on a lesson slide — 2–3 sentences where `caption` was
   * one line, so it sits two steps below it and leans on weight, not size.
   */
  narration: { fontSize: 21, lineHeight: 30, fontWeight: '700' as const },
  /** The same block when the writer ran long; keeps it off the progress dots. */
  narrationLong: { fontSize: 18, lineHeight: 26, fontWeight: '700' as const },
  prompt: { fontSize: 22, lineHeight: 29, fontWeight: '700' as const },
  option: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 1.1 },
  score: { fontSize: 68, lineHeight: 74, fontWeight: '900' as const },
} as const;
