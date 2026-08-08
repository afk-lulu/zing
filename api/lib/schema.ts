import { z } from 'zod';

/**
 * The Batch Spec is the one contract between every pipeline stage and the app
 * (ARCH §3). This file is its source of truth; `mobile/src/types/batch.ts`
 * mirrors these shapes as plain TypeScript types for the Expo app.
 *
 * Hard budgets from the Planner (ARCH §2.S3) are encoded here so a malformed
 * plan fails validation server-side rather than blowing up the demo:
 *   ≤12 slides · ≤12 images · 3–5 questions · ≥3 distinct question types.
 */

export const DIFFICULTIES = ['easy', 'on-level', 'challenge'] as const;
export const Difficulty = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof Difficulty>;

export const QUESTION_TYPES = ['slider', 'single', 'multi', 'order'] as const;
export const QuestionType = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionType>;

export const KEN_BURNS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'] as const;
export const KenBurns = z.enum(KEN_BURNS);
export type KenBurns = z.infer<typeof KenBurns>;

export const MAX_SLIDES = 12;
export const MAX_IMAGES = 12;
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 5;
export const MIN_DISTINCT_QUESTION_TYPES = 3;

/* ------------------------------------------------------------------ *
 * S1 — Extractor output
 * ------------------------------------------------------------------ */

export const ExtractedTopic = z.object({
  topic: z.string().min(1),
  subject: z.string().min(1),
  /** Concrete problems lifted off the worksheet, best-guess for handwriting. */
  problems: z.array(z.string()).max(8).default([]),
});
export type ExtractedTopic = z.infer<typeof ExtractedTopic>;

export const Extraction = z.object({
  /** Display-ready labels, e.g. "Math · Fractions". */
  subjects: z.array(z.string().min(1)).min(1).max(4),
  topicSummary: z.string().min(1),
  /** K-12 curriculum framing, e.g. "3rd–4th grade". */
  gradeBand: z.string().min(1),
  topics: z.array(ExtractedTopic).min(1).max(3),
  /** Caveats about handwriting the Extractor had to guess at. */
  notes: z.string().default(''),
});
export type Extraction = z.infer<typeof Extraction>;

/* ------------------------------------------------------------------ *
 * S2 — Researcher swarm output
 * ------------------------------------------------------------------ */

export const TopicResearch = z.object({
  topic: z.string().min(1),
  /** Grade-band-appropriate concepts the lesson should land. */
  concepts: z.array(z.string()).max(6).default([]),
  /** Feeds Challenge-difficulty distractors. */
  misconceptions: z.array(z.string()).max(6).default([]),
  /** Feeds lesson hooks. */
  funFacts: z.array(z.string()).max(6).default([]),
});
export type TopicResearch = z.infer<typeof TopicResearch>;

export const Research = z.object({
  topics: z.array(TopicResearch),
});
export type Research = z.infer<typeof Research>;

/* ------------------------------------------------------------------ *
 * S3 — Planner output
 * ------------------------------------------------------------------ */

export const PlanGroup = z.object({
  topic: z.string().min(1),
  /** What the lesson slides in this group should teach. */
  lessonFocus: z.string().min(1),
  slideCount: z.number().int().min(1).max(4),
  questionType: QuestionType,
  questionFocus: z.string().min(1),
});
export type PlanGroup = z.infer<typeof PlanGroup>;

export const Plan = z.object({
  topicSummary: z.string().min(1),
  subjects: z.array(z.string().min(1)).min(1).max(4),
  groups: z.array(PlanGroup).min(3).max(5),
});
export type Plan = z.infer<typeof Plan>;

/* ------------------------------------------------------------------ *
 * S3 — Writer outputs
 * ------------------------------------------------------------------ */

/**
 * Image-prompt hard rule (ARCH §2.S3): scene / character / metaphor only.
 * Every word the child reads is a native RN overlay, never pixels.
 */
export const WrittenSlide = z.object({
  narration: z.string().min(1),
  caption: z.string().min(1),
  imagePrompt: z.string().min(1),
});
export type WrittenSlide = z.infer<typeof WrittenSlide>;

export const SliderConfig = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  unit: z.string().default(''),
});

export const SliderAnswerKey = z.object({
  mode: z.literal('numeric-tolerance'),
  value: z.number(),
  tolerance: z.number().min(0),
});

export const OptionsConfig = z.object({
  options: z.array(z.string().min(1)).min(2).max(4),
});

export const SingleAnswerKey = z.object({
  mode: z.literal('single-index'),
  correctIndex: z.number().int().min(0),
});

export const MultiAnswerKey = z.object({
  mode: z.literal('index-set'),
  correctIndices: z.array(z.number().int().min(0)).min(1),
});

export const OrderConfig = z.object({
  items: z.array(z.string().min(1)).min(3).max(5),
});

export const OrderAnswerKey = z.object({
  mode: z.literal('exact-order'),
  correctOrder: z.array(z.number().int().min(0)).min(3),
});

const QuestionBase = {
  /**
   * Quiz writers are not asked for an id — /api/compose assigns `q1`…`qN` after
   * validation so ids stay unique and stable even if a group is dropped.
   */
  id: z.string().min(1).default('q'),
  prompt: z.string().min(1),
  explanation: z.string().min(1),
};

export const Question = z
  .discriminatedUnion('type', [
    z.object({
      ...QuestionBase,
      type: z.literal('slider'),
      config: SliderConfig,
      answerKey: SliderAnswerKey,
    }),
    z.object({
      ...QuestionBase,
      type: z.literal('single'),
      config: OptionsConfig,
      answerKey: SingleAnswerKey,
    }),
    z.object({
      ...QuestionBase,
      type: z.literal('multi'),
      config: OptionsConfig,
      answerKey: MultiAnswerKey,
    }),
    z.object({
      ...QuestionBase,
      type: z.literal('order'),
      config: OrderConfig,
      answerKey: OrderAnswerKey,
    }),
  ])
  // Cross-field checks the writers can still get wrong even with a valid shape.
  .superRefine((q, ctx) => {
    if (q.type === 'slider' && q.config.max <= q.config.min) {
      ctx.addIssue({ code: 'custom', message: 'slider config.max must exceed config.min' });
    }
    if (q.type === 'slider' && (q.answerKey.value < q.config.min || q.answerKey.value > q.config.max)) {
      ctx.addIssue({ code: 'custom', message: 'slider answer falls outside [min, max]' });
    }
    if (q.type === 'single' && q.answerKey.correctIndex >= q.config.options.length) {
      ctx.addIssue({ code: 'custom', message: 'correctIndex out of range' });
    }
    if (q.type === 'multi') {
      const n = q.config.options.length;
      if (q.answerKey.correctIndices.some((i) => i >= n)) {
        ctx.addIssue({ code: 'custom', message: 'correctIndices out of range' });
      }
      if (new Set(q.answerKey.correctIndices).size !== q.answerKey.correctIndices.length) {
        ctx.addIssue({ code: 'custom', message: 'correctIndices contains duplicates' });
      }
    }
    if (q.type === 'order') {
      const n = q.config.items.length;
      const order = q.answerKey.correctOrder;
      const isPermutation =
        order.length === n && new Set(order).size === n && order.every((i) => i >= 0 && i < n);
      if (!isPermutation) {
        ctx.addIssue({ code: 'custom', message: 'correctOrder must be a permutation of items' });
      }
    }
  });
export type Question = z.infer<typeof Question>;

export const Encouragement = z.object({
  high: z.string().min(1),
  mid: z.string().min(1),
  low: z.string().min(1),
});
export type Encouragement = z.infer<typeof Encouragement>;

/* ------------------------------------------------------------------ *
 * The Batch Spec itself
 * ------------------------------------------------------------------ */

export const Slide = z.object({
  /** Filled by S4. Absent until then. */
  imageUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  narration: z.string().min(1),
  caption: z.string().min(1),
  imagePrompt: z.string().min(1),
  kenBurns: KenBurns,
});
export type Slide = z.infer<typeof Slide>;

export const Lesson = z.object({
  slides: z.array(Slide).min(1).max(4),
});
export type Lesson = z.infer<typeof Lesson>;

export const Group = z.object({
  lessons: z.array(Lesson).min(1),
  quiz: Question,
});
export type Group = z.infer<typeof Group>;

export const BatchSpec = z
  .object({
    batchId: z.string().min(1),
    topicSummary: z.string().min(1),
    subjects: z.array(z.string().min(1)).min(1).max(4),
    difficulty: Difficulty,
    encouragement: Encouragement,
    groups: z.array(Group).min(MIN_QUESTIONS).max(MAX_QUESTIONS),
  })
  .superRefine((batch, ctx) => {
    const slideCount = countSlides(batch);
    if (slideCount > MAX_SLIDES) {
      ctx.addIssue({ code: 'custom', message: `batch has ${slideCount} slides, budget is ${MAX_SLIDES}` });
    }
    const distinctTypes = new Set(batch.groups.map((g) => g.quiz.type)).size;
    if (distinctTypes < MIN_DISTINCT_QUESTION_TYPES) {
      ctx.addIssue({
        code: 'custom',
        message: `batch uses ${distinctTypes} question types, need ≥${MIN_DISTINCT_QUESTION_TYPES}`,
      });
    }
    const ids = batch.groups.map((g) => g.quiz.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'question ids must be unique' });
    }
  });
export type BatchSpec = z.infer<typeof BatchSpec>;

export function countSlides(batch: Pick<BatchSpec, 'groups'>): number {
  return batch.groups.reduce(
    (total, group) => total + group.lessons.reduce((n, lesson) => n + lesson.slides.length, 0),
    0,
  );
}

export function allSlides(batch: Pick<BatchSpec, 'groups'>): Slide[] {
  return batch.groups.flatMap((group) => group.lessons.flatMap((lesson) => lesson.slides));
}
