/** One place for the look, so every page in the feed reads as the same app. */
export const colors = {
  bg: '#0B0B14',
  bgLift: '#15152A',
  card: 'rgba(21, 21, 42, 0.92)',
  text: '#F6F5FF',
  textDim: 'rgba(246, 245, 255, 0.62)',
  accent: '#7C5CFF',
  accentSoft: 'rgba(124, 92, 255, 0.18)',
  correct: '#31D68F',
  correctSoft: 'rgba(49, 214, 143, 0.16)',
  wrong: '#FF5C7A',
  wrongSoft: 'rgba(255, 92, 122, 0.16)',
  hairline: 'rgba(246, 245, 255, 0.14)',
} as const;

/** Slide backdrop when a fal image is missing — captions still read cleanly. */
export const slideFallbackTints = ['#1E1B4B', '#2A1B4B', '#1B2E4B', '#3B1B3B', '#1B3B33'] as const;

export const radius = { sm: 10, md: 18, lg: 28, pill: 999 } as const;

/** Spreadable absolute fill. `StyleSheet.absoluteFillObject` is not typed in RN 0.86. */
export const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 36 } as const;

export const type = {
  caption: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  prompt: { fontSize: 22, lineHeight: 29, fontWeight: '700' as const },
  option: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 1.1 },
  score: { fontSize: 68, lineHeight: 74, fontWeight: '900' as const },
} as const;
