import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { askJson, askJsonOrNull } from '@/lib/claude';
import {
  ENCOURAGER_SYSTEM,
  LESSON_WRITER_SYSTEM,
  PLANNER_SYSTEM,
  QUIZ_WRITER_SYSTEM,
  encouragerUser,
  lessonWriterUser,
  plannerUser,
  quizWriterUser,
} from '@/lib/prompts';
import { StageError, fail, formatIssues, ok, readBody } from '@/lib/http';
import { resetMockCounters } from '@/lib/mock';
import {
  BatchSpec,
  Difficulty,
  Encouragement,
  Extraction,
  KEN_BURNS,
  MAX_SLIDES,
  MIN_QUESTIONS,
  Plan,
  Question,
  Research,
  WrittenSlide,
  type Group,
  type KenBurns,
  type PlanGroup,
} from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RequestBody = z.object({
  extraction: Extraction,
  research: Research,
  difficulty: Difficulty,
});

const LessonWriterOutput = z.object({
  slides: z.array(WrittenSlide).min(1).max(4),
});

const FALLBACK_ENCOURAGEMENT: Encouragement = {
  high: "You nailed it. Your brain did some serious work today — go tell someone what you learned!",
  mid: "Nice work! You got real answers right, and the ones you missed are just the next thing you get to learn.",
  low: "You showed up and tried every question, and that is how learning actually starts. Let's run it again.",
};

/**
 * S3 — the swarm's core. One route, three internal waves (ARCH §2.S3):
 *   1. Curriculum Planner (1 call) lays out the batch inside the hard budgets.
 *   2. Lesson Writers ‖ Quiz Writers ‖ Encourager, all in one Promise.all.
 *   3. Assemble, drop malformed groups, Zod-validate the Batch Spec.
 *
 * Fewer than 3 valid questions is an error, which the app turns into a
 * seamless jump to the bundled fallback batch.
 */
export async function POST(request: Request) {
  try {
    const { extraction, research, difficulty } = await readBody(request, RequestBody);
    resetMockCounters();
    const researchByTopic = new Map(research.topics.map((t) => [t.topic, t]));

    // ---- Wave 1: Curriculum Planner -------------------------------------
    const plan = await askJson({
      agent: 'planner',
      system: PLANNER_SYSTEM,
      user: plannerUser(extraction, research.topics, difficulty),
      schema: Plan,
      effort: 'medium',
      maxTokens: 2048,
    });

    const plannedGroups = applySlideBudget(plan.groups);

    // ---- Wave 2: Writers ‖ Encourager -----------------------------------
    const [writtenGroups, encouragement] = await Promise.all([
      Promise.all(
        plannedGroups.map(async (group) => {
          const topicResearch = researchByTopic.get(group.topic);
          const [lesson, quiz] = await Promise.all([
            askJsonOrNull({
              agent: `lesson-writer:${group.topic}`,
              system: LESSON_WRITER_SYSTEM,
              user: lessonWriterUser(group, topicResearch, extraction.gradeBand, difficulty),
              schema: LessonWriterOutput,
              effort: 'low',
              maxTokens: 2048,
            }),
            askJsonOrNull({
              agent: `quiz-writer:${group.topic}`,
              system: QUIZ_WRITER_SYSTEM,
              user: quizWriterUser(group, topicResearch, extraction.gradeBand, difficulty),
              schema: Question,
              effort: 'low',
              maxTokens: 1536,
            }),
          ]);
          return { group, lesson, quiz };
        }),
      ),
      askJsonOrNull({
        agent: 'encourager',
        system: ENCOURAGER_SYSTEM,
        user: encouragerUser(plan.topicSummary, extraction.gradeBand),
        schema: Encouragement,
        effort: 'low',
        maxTokens: 512,
      }),
    ]);

    // ---- Wave 3: assemble ------------------------------------------------
    let kenBurnsCursor = 0;
    const groups: Group[] = [];

    for (const [index, written] of writtenGroups.entries()) {
      // A group needs both halves. Either writer failing drops the group
      // rather than shipping a lesson with no question or vice versa.
      if (!written.lesson || !written.quiz) continue;

      groups.push({
        lessons: [
          {
            slides: written.lesson.slides.map((slide) => ({
              ...slide,
              kenBurns: KEN_BURNS[kenBurnsCursor++ % KEN_BURNS.length] as KenBurns,
            })),
          },
        ],
        quiz: { ...written.quiz, id: `q${index + 1}` },
      });
    }

    if (groups.length < MIN_QUESTIONS) {
      throw new StageError(
        `only ${groups.length} valid group(s) survived validation, need ≥${MIN_QUESTIONS}`,
        502,
        'compose',
      );
    }

    const candidate = {
      batchId: randomUUID(),
      topicSummary: plan.topicSummary || extraction.topicSummary,
      subjects: plan.subjects.length ? plan.subjects : extraction.subjects,
      difficulty,
      encouragement: encouragement ?? FALLBACK_ENCOURAGEMENT,
      groups,
    };

    const parsed = BatchSpec.safeParse(candidate);
    if (!parsed.success) {
      throw new StageError(`assembled batch failed validation — ${formatIssues(parsed.error)}`, 502, 'compose');
    }

    return ok({ batch: parsed.data });
  } catch (error) {
    return fail(error, 'compose');
  }
}

/**
 * The Planner is told the ≤12-slide budget, but a plan that overshoots should
 * degrade rather than fail: trim from the back until it fits.
 */
function applySlideBudget(groups: PlanGroup[]): PlanGroup[] {
  const trimmed = groups.map((group) => ({ ...group }));
  let total = trimmed.reduce((n, group) => n + group.slideCount, 0);

  for (let i = trimmed.length - 1; i >= 0 && total > MAX_SLIDES; i--) {
    while (total > MAX_SLIDES && trimmed[i].slideCount > 1) {
      trimmed[i].slideCount--;
      total--;
    }
  }
  return trimmed;
}
