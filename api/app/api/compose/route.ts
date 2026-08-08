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
  MIN_DISTINCT_QUESTION_TYPES,
  MIN_QUESTIONS,
  Plan,
  Research,
  WrittenQuestion,
  WrittenSlide,
  countDistinctTypes,
  type Group,
  type KenBurns,
  type PlanGroup,
  type Question,
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
      // The Planner is the one sequential call in S3 — every second here is a
      // second the writer fan-out has not started. Its budgets and type rules
      // are spelled out in the prompt, so it is choosing topics and framings,
      // not reasoning its way to them: `low` costs ~4s less than `medium` and
      // produced the same shape of plan across runs.
      effort: 'low',
      maxTokens: 1024,
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
              schema: WrittenQuestion,
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
        quiz: { ...scrambleIfOrdered(written.quiz), id: `q${index + 1}` },
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

    // A batch short on variety still teaches. ARCH §2.S3 asks the Planner for
    // ≥3 widgets and the Planner is told to open with three distinct ones, but
    // if a group was dropped on the way through we ship what survived and say
    // so — the alternative is 502-ing a working batch into the fallback.
    const distinctTypes = countDistinctTypes(parsed.data);
    if (distinctTypes < MIN_DISTINCT_QUESTION_TYPES) {
      console.warn(
        `[zing:compose] batch uses ${distinctTypes} question type(s), ARCH §2.S3 wants ≥${MIN_DISTINCT_QUESTION_TYPES} — shipping anyway`,
      );
    }

    return ok({ batch: parsed.data });
  } catch (error) {
    return fail(error, 'compose');
  }
}

/**
 * Quiz Writers hand back `order` items already in the correct sequence (see
 * `WrittenQuestion`). Scramble them here and read the key straight off the
 * scramble, so the answer key is a fact about what we did rather than a claim
 * the writer made about a list it shuffled in its head.
 *
 * `correctOrder[i]` is the index — into the scrambled `items` the child sees —
 * of the item that belongs in position `i`.
 */
function scrambleIfOrdered(quiz: WrittenQuestion): Question {
  if (quiz.type !== 'order') return quiz;

  const correct = quiz.config.items;
  // Positions into `correct`, scrambled. Retry a couple of times rather than
  // handing the child a list that is already in the right order.
  let positions = correct.map((_, i) => i);
  for (let attempt = 0; attempt < 5; attempt++) {
    positions = shuffle(positions);
    if (positions.some((from, at) => from !== at)) break;
  }

  const items = positions.map((from) => correct[from]);
  // `positions[at] = from` scrambles; inverting it says where each correct item
  // ended up, which is exactly what the client grades against.
  const correctOrder = correct.map((_, from) => positions.indexOf(from));

  return { ...quiz, config: { items }, answerKey: { mode: 'exact-order', correctOrder } };
}

function shuffle<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The Planner is told the ≤12-slide budget, but a plan that overshoots should
 * degrade rather than fail: shave slides until it fits.
 *
 * One pass over the groups per slide removed, back to front, so an overshoot
 * costs every group a slide before it costs any group two. Draining the last
 * group to a single slide first — which is what trimming one group at a time
 * does — is the worst of the available outcomes on screen: the batch visibly
 * runs out of steam right at the end, where the ScoreCard payoff lives.
 */
function applySlideBudget(groups: PlanGroup[]): PlanGroup[] {
  const trimmed = groups.map((group) => ({ ...group }));
  let total = trimmed.reduce((n, group) => n + group.slideCount, 0);

  while (total > MAX_SLIDES) {
    const before = total;
    for (let i = trimmed.length - 1; i >= 0 && total > MAX_SLIDES; i--) {
      if (trimmed[i].slideCount > 1) {
        trimmed[i].slideCount--;
        total--;
      }
    }
    // Every group is down to one slide and it still does not fit — the group
    // count itself is the problem, and BatchSpec will catch that.
    if (total === before) break;
  }
  return trimmed;
}
