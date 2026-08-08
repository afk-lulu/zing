import {
  MAX_QUESTIONS,
  MAX_SLIDES,
  MIN_DISTINCT_QUESTION_TYPES,
  MIN_QUESTIONS,
  QUESTION_TYPES,
  type Difficulty,
  type Extraction,
  type PlanGroup,
  type TopicResearch,
} from './schema';

/** The difficulty rubric every downstream agent applies (ARCH §2.S3). */
export const DIFFICULTY_RUBRIC: Record<Difficulty, string> = {
  easy: 'Easy — single-step recall, generously framed. Give the child a visible foothold in the question itself.',
  'on-level': 'On-level — grade-typical application. One idea applied to a fresh situation.',
  challenge:
    'Challenge — multi-step reasoning, and wrong options should be built from real misconceptions rather than random numbers.',
};

const JSON_ONLY = 'Reply with the JSON object only. No prose before or after it, no code fence.';

/* ------------------------------------------------------------------ *
 * S1 — Extractor
 * ------------------------------------------------------------------ */

export const EXTRACTOR_SYSTEM = `You read a child's school worksheet and describe what it is teaching, framed against a K-12 curriculum.

You are looking at a photo or PDF that may be handwritten, skewed, or partly obscured. Give your best reading rather than refusing: if a number or word is unclear, take the most plausible interpretation for the grade level and record the uncertainty in "notes". You are identifying topics, not transcribing — a slightly misread digit changes nothing downstream.

Return at most 3 topics; if the worksheet covers more, pick the 3 that carry the most of the page. For each topic, quote 2-4 concrete problems as they appear on the page.

Subjects are display labels shown to the child as chips, formatted "Subject · Topic" — for example "Math · Fractions" or "Science · Habitats".

Return this JSON:
{
  "subjects": ["Math · Fractions"],
  "topicSummary": "Fractions + animal habitats",
  "gradeBand": "3rd-4th grade",
  "topics": [
    { "topic": "Equivalent fractions", "subject": "Math", "problems": ["2/4 = ?/8", "Shade 3/6 of the bar"] }
  ],
  "notes": "Handwriting on question 4 was unclear; read as 3/8."
}

${JSON_ONLY}`;

export function extractorUser(difficulty: Difficulty): string {
  return `This worksheet belongs to a child who is about to get a ${difficulty} lesson batch built from it. Read it and return the JSON.`;
}

/* ------------------------------------------------------------------ *
 * S2 — Researcher swarm (one call per topic, web_search on)
 * ------------------------------------------------------------------ */

export const RESEARCHER_SYSTEM = `You research one school topic so a lesson writer can teach it well to a specific grade band.

Search the web when it would sharpen what you return — current teaching framing, a fact worth a child's attention, or the mistakes children actually make on this topic. Then return three lists:

- concepts: what a child at this grade band needs to understand. Plain language, one idea each.
- misconceptions: specific wrong beliefs children hold about this topic. These become the wrong answers in Challenge questions, so they must be plausible-wrong, not absurd-wrong.
- funFacts: one-line facts surprising enough to open a lesson with.

Return this JSON:
{
  "topic": "Equivalent fractions",
  "concepts": ["..."],
  "misconceptions": ["Thinking 1/3 is smaller than 1/4 because 3 is smaller than 4"],
  "funFacts": ["..."]
}

${JSON_ONLY}`;

export function researcherUser(
  topic: string,
  subject: string,
  problems: string[],
  gradeBand: string,
  difficulty: Difficulty,
): string {
  return [
    `Topic: ${topic}`,
    `Subject: ${subject}`,
    `Grade band: ${gradeBand}`,
    `Target difficulty: ${DIFFICULTY_RUBRIC[difficulty]}`,
    problems.length ? `Problems from the child's worksheet:\n- ${problems.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * S3 wave 1 — Curriculum Planner
 * ------------------------------------------------------------------ */

export const PLANNER_SYSTEM = `You lay out a short vertical-feed lesson batch for one child, in the rhythm of a TikTok feed: a few lesson slides, then a question, repeated.

Budgets, which are hard:
- ${MIN_QUESTIONS}-${MAX_QUESTIONS} groups, one question each.
- ${MAX_SLIDES} lesson slides across the whole batch, so 1-3 slides per group.
- At least ${MIN_DISTINCT_QUESTION_TYPES} of the ${QUESTION_TYPES.length} question types appear: ${QUESTION_TYPES.join(', ')}.

Choose each group's question type from what the material actually calls for:
- slider: a quantity, percentage, or measurement on a continuum.
- single: one right answer among a few.
- multi: several correct answers in a set, e.g. "which of these are mammals".
- order: a sequence or ranking, e.g. steps of a process or smallest to largest.

Spread the groups across the topics available rather than spending the whole batch on one.

Return this JSON:
{
  "topicSummary": "Fractions + animal habitats",
  "subjects": ["Math · Fractions", "Science · Habitats"],
  "groups": [
    {
      "topic": "Equivalent fractions",
      "lessonFocus": "Two different fractions can name the same amount of pizza",
      "slideCount": 2,
      "questionType": "slider",
      "questionFocus": "Given 2 of 8 slices eaten, what percent is left"
    }
  ]
}

${JSON_ONLY}`;

export function plannerUser(
  extraction: Extraction,
  research: TopicResearch[],
  difficulty: Difficulty,
): string {
  return [
    `Grade band: ${extraction.gradeBand}`,
    `Difficulty: ${DIFFICULTY_RUBRIC[difficulty]}`,
    `Worksheet summary: ${extraction.topicSummary}`,
    extraction.notes ? `Extractor notes: ${extraction.notes}` : '',
    '',
    'Topics from the worksheet:',
    ...extraction.topics.map(
      (t) => `- ${t.topic} (${t.subject})${t.problems.length ? ` — problems: ${t.problems.join('; ')}` : ''}`,
    ),
    '',
    'Research:',
    ...research.map((r) =>
      [
        `- ${r.topic}`,
        r.concepts.length ? `  concepts: ${r.concepts.join('; ')}` : '',
        r.misconceptions.length ? `  misconceptions: ${r.misconceptions.join('; ')}` : '',
        r.funFacts.length ? `  fun facts: ${r.funFacts.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * S3 wave 2 — Lesson Writers
 * ------------------------------------------------------------------ */

export const LESSON_WRITER_SYSTEM = `You write the lesson slides for one group of a vertical-feed learning app. Each slide is a full-screen illustration with a spoken narration over it and a short caption on top.

Per slide:
- narration: 2-3 warm sentences, spoken aloud to the child by a friendly teacher. Address the child directly. This is read by a text-to-speech voice, so write it to be heard: no bullet points, no parentheses, no symbols like "%" or "3/4" — write "seventy-five percent", "three quarters".
- caption: at most 8 words, the one thing on screen.
- imagePrompt: what the illustration shows.

The image-prompt rule is absolute: describe a scene, a character, or a visual metaphor and nothing else. No text, no labels, no numbers, no letters, no diagrams, no charts, no arrows, no equations, no signs, no writing of any kind. Image models render words as garbage, and every word the child reads is drawn by the app on top of your picture. "A pizza cut into eight equal slices, two slices missing, on a checkered tablecloth" is right. "A pizza labelled 2/8" is not.

Return this JSON:
{ "slides": [ { "narration": "...", "caption": "...", "imagePrompt": "..." } ] }

${JSON_ONLY}`;

export function lessonWriterUser(
  group: PlanGroup,
  research: TopicResearch | undefined,
  gradeBand: string,
  difficulty: Difficulty,
): string {
  return [
    `Write exactly ${group.slideCount} slide${group.slideCount === 1 ? '' : 's'}.`,
    `Topic: ${group.topic}`,
    `Teach: ${group.lessonFocus}`,
    `Grade band: ${gradeBand}`,
    `Difficulty: ${DIFFICULTY_RUBRIC[difficulty]}`,
    `These slides set up the question that follows: ${group.questionFocus}`,
    research?.concepts.length ? `Concepts to land: ${research.concepts.join('; ')}` : '',
    research?.funFacts.length ? `Hooks you can open with: ${research.funFacts.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * S3 wave 2 — Quiz Writers
 * ------------------------------------------------------------------ */

export const QUIZ_WRITER_SYSTEM = `You write one question for a vertical-feed learning app. The child answers it with a native widget, so the shape of your answer key has to match the widget exactly.

The four question types and their exact config/answerKey shapes:

slider — a number on a continuum, answered by dragging.
  "config":    { "min": 0, "max": 100, "step": 5, "unit": "%" }
  "answerKey": { "mode": "numeric-tolerance", "value": 75, "tolerance": 5 }
  Set tolerance so a child who understands lands inside it and a child who guesses does not.

single — one correct option among 2-4.
  "config":    { "options": ["...", "...", "..."] }
  "answerKey": { "mode": "single-index", "correctIndex": 2 }

multi — a set of 2-4 options, more than one correct.
  "config":    { "options": ["...", "...", "...", "..."] }
  "answerKey": { "mode": "index-set", "correctIndices": [0, 2] }

order — 3-5 items the child taps into sequence.
  "config":    { "items": ["...", "...", "..."] }
  "answerKey": { "mode": "exact-order", "correctOrder": [2, 0, 1] }
  correctOrder lists indexes into items, first to last. List items in a scrambled order, not already correct.

Write the prompt so it can be read in one breath on a phone screen. The explanation is shown after the child answers, right or wrong: one or two sentences saying why the answer is what it is, warm and never scolding.

Return this JSON, using the config and answerKey shapes for your assigned type:
{ "type": "slider", "prompt": "...", "config": {...}, "answerKey": {...}, "explanation": "..." }

${JSON_ONLY}`;

export function quizWriterUser(
  group: PlanGroup,
  research: TopicResearch | undefined,
  gradeBand: string,
  difficulty: Difficulty,
): string {
  const misconceptionLine =
    difficulty === 'challenge' && research?.misconceptions.length
      ? `Build the wrong options out of these real misconceptions: ${research.misconceptions.join('; ')}`
      : research?.misconceptions.length
        ? `Misconceptions to steer around: ${research.misconceptions.join('; ')}`
        : '';

  return [
    `Write one question of type "${group.questionType}". Do not use any other type.`,
    `Topic: ${group.topic}`,
    `Ask about: ${group.questionFocus}`,
    `The child has just watched slides teaching: ${group.lessonFocus}`,
    `Grade band: ${gradeBand}`,
    `Difficulty: ${DIFFICULTY_RUBRIC[difficulty]}`,
    misconceptionLine,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * S3 wave 2 — Encourager
 * ------------------------------------------------------------------ */

export const ENCOURAGER_SYSTEM = `You write the three messages a child sees on the scorecard at the end of a lesson batch, one per score band.

- high: they scored 80% or better.
- mid: they scored 50-79%.
- low: they scored under 50%.

Speak to the child, not about them. One or two sentences each. Praise the effort and what they now know rather than how clever they are, and never make the low message a consolation prize — a child who got two wrong learned something, so say what.

Return this JSON:
{ "high": "...", "mid": "...", "low": "..." }

${JSON_ONLY}`;

export function encouragerUser(topicSummary: string, gradeBand: string): string {
  return `The child just worked through a batch on: ${topicSummary}\nGrade band: ${gradeBand}`;
}
