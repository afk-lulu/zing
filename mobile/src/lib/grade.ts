import type { Answer, Question } from '../types/batch';

/**
 * Grading is a pure function on the client (ARCH §3) — no round trip, so
 * feedback lands the instant the child answers.
 *
 * Per-type rules, straight from the Batch Spec:
 *   slider → within tolerance of the value
 *   single → the one index
 *   multi  → set equality, order irrelevant
 *   order  → exact sequence
 */
export function gradeAnswer(question: Question, answer: Answer): boolean {
  if (question.type !== answer.type) return false;

  switch (question.type) {
    case 'slider': {
      const { value, tolerance } = question.answerKey;
      return Math.abs((answer as { value: number }).value - value) <= tolerance;
    }
    case 'single':
      return (answer as { index: number }).index === question.answerKey.correctIndex;
    case 'multi': {
      const given = new Set((answer as { indices: number[] }).indices);
      const expected = question.answerKey.correctIndices;
      return given.size === expected.length && expected.every((index) => given.has(index));
    }
    case 'order': {
      const given = (answer as { order: number[] }).order;
      const expected = question.answerKey.correctOrder;
      return given.length === expected.length && expected.every((index, i) => given[i] === index);
    }
  }
}

/** The one-line "why" shown under the correct answer once feedback is up. */
export function correctAnswerLabel(question: Question): string {
  switch (question.type) {
    case 'slider':
      return `${question.answerKey.value}${question.config.unit}`;
    case 'single':
      return question.config.options[question.answerKey.correctIndex] ?? '';
    case 'multi':
      return question.answerKey.correctIndices
        .map((index) => question.config.options[index])
        .filter(Boolean)
        .join(', ');
    case 'order':
      return question.answerKey.correctOrder
        .map((index) => question.config.items[index])
        .filter(Boolean)
        .join(' → ');
  }
}

export type ScoreBand = 'high' | 'mid' | 'low';

/** ScoreCard bands from ARCH §2.S3: high ≥80% · mid ≥50% · low. */
export function scoreBand(score: number, total: number): ScoreBand {
  if (total === 0) return 'low';
  const pct = score / total;
  if (pct >= 0.8) return 'high';
  if (pct >= 0.5) return 'mid';
  return 'low';
}
