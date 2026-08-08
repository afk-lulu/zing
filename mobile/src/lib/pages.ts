import type { BatchSpec, Question, Slide } from '../types/batch';

/**
 * The player flattens `groups` into one linear page list (ARCH §3):
 *   [...slides, quizPage] × groups, then scoreCardPage
 * so the FlatList only ever thinks about a flat array of full-screen pages.
 */
export type Page =
  | { kind: 'slide'; key: string; groupIndex: number; slideIndex: number; slide: Slide }
  | { kind: 'quiz'; key: string; groupIndex: number; question: Question }
  | { kind: 'scorecard'; key: string };

export function buildPages(batch: BatchSpec): Page[] {
  const pages: Page[] = [];

  batch.groups.forEach((group, groupIndex) => {
    let slideIndex = 0;
    for (const lesson of group.lessons) {
      for (const slide of lesson.slides) {
        pages.push({
          kind: 'slide',
          key: `g${groupIndex}-s${slideIndex}`,
          groupIndex,
          slideIndex,
          slide,
        });
        slideIndex++;
      }
    }
    pages.push({
      kind: 'quiz',
      key: `g${groupIndex}-quiz`,
      groupIndex,
      question: group.quiz,
    });
  });

  pages.push({ kind: 'scorecard', key: 'scorecard' });
  return pages;
}

export function questionCount(batch: BatchSpec): number {
  return batch.groups.length;
}
