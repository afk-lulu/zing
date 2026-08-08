/**
 * Offline mock mode. Lets the whole pipeline run with no API keys and no spend.
 *
 *   ZING_MOCK=1      every agent and asset call succeeds
 *   ZING_MOCK=chaos  failures injected on purpose (see below)
 *   ZING_MOCK unset  real Claude / fal / ElevenLabs
 *
 * The mock replaces only the network call. Everything downstream is the real
 * thing: responses come back as raw *text* — some fenced, some with a sentence
 * of preamble — so `extractJson` and the Zod schemas do exactly the work they
 * do in production.
 *
 * `chaos` reproduces the ARCH §7 risk table without waiting for a bad night.
 * The Planner emits 5 groups, typed `slider, single, multi, order, slider`, and
 * two are then sabotaged — chosen so the survivors still clear the ≥3 groups
 * and ≥3 distinct question types the Batch Spec demands:
 *   · group 3 (multi)  — writer answers in prose      → `extractJson` throws, group dropped
 *   · group 5 (slider) — answer outside [min, max]    → Zod `superRefine` catches it, group dropped
 *   · one fal call fails                              → slide keeps its caption over a tint
 *   · one ElevenLabs call fails                       → slide plays silent on the read-length timer
 *
 * Injections are keyed to call index, so they must line up with the type the
 * Planner assigns that group — an injection in a branch the run never reaches
 * is a test that quietly proves nothing.
 */

export type MockMode = 'off' | 'clean' | 'chaos';

export function mockMode(): MockMode {
  const raw = process.env.ZING_MOCK?.toLowerCase().trim();
  if (!raw || raw === '0' || raw === 'false' || raw === 'off') return 'off';
  return raw === 'chaos' ? 'chaos' : 'clean';
}

export const isMock = (): boolean => mockMode() !== 'off';

/* ------------------------------------------------------------------ *
 * Agent responses
 * ------------------------------------------------------------------ */

const TOPICS = [
  { topic: 'Equivalent fractions', subject: 'Math' },
  { topic: 'Comparing fractions', subject: 'Math' },
  { topic: 'Animal habitats', subject: 'Science' },
];

const QUESTION_TYPES = ['slider', 'single', 'multi', 'order'] as const;

/**
 * Answers as the named agent would. `user` is the flattened prompt, which the
 * writers read to learn how many slides and which question type they were
 * assigned — the same coupling the real prompts rely on.
 */
export function mockAgentResponse(agent: string, user: string): string {
  const chaos = mockMode() === 'chaos';

  if (agent === 'extractor') {
    // Fenced, because real models often fence.
    return fence({
      subjects: ['Math · Fractions', 'Science · Habitats'],
      topicSummary: 'Fractions + animal habitats',
      gradeBand: '3rd-4th grade',
      topics: TOPICS.map((t) => ({
        ...t,
        problems: [`${t.topic} problem A`, `${t.topic} problem B`],
      })),
      notes: 'ZING_MOCK is on — this extraction is canned, not read from a worksheet.',
    });
  }

  if (agent.startsWith('researcher:')) {
    const topic = agent.slice('researcher:'.length);
    return JSON.stringify({
      topic,
      concepts: [`Core idea behind ${topic}`, `How ${topic} shows up day to day`],
      misconceptions: [`The usual wrong turn on ${topic}`],
      funFacts: [`Something surprising about ${topic}`],
    });
  }

  if (agent === 'planner') {
    // 5 groups under chaos so the two deliberately-broken ones still leave a
    // valid batch — which is the thing being demonstrated.
    const count = chaos ? 5 : 4;
    return JSON.stringify({
      topicSummary: 'Fractions + animal habitats',
      subjects: ['Math · Fractions', 'Science · Habitats'],
      groups: Array.from({ length: count }, (_, i) => {
        const topic = TOPICS[i % TOPICS.length];
        return {
          topic: topic.topic,
          lessonFocus: `What matters most about ${topic.topic}`,
          slideCount: 2,
          questionType: QUESTION_TYPES[i % QUESTION_TYPES.length],
          questionFocus: `Applying ${topic.topic} to a new situation`,
        };
      }),
    });
  }

  if (agent.startsWith('lesson-writer:')) {
    const topic = agent.slice('lesson-writer:'.length);
    const slideCount = Number(/Write exactly (\d+) slide/.exec(user)?.[1] ?? 2);
    return JSON.stringify({
      slides: Array.from({ length: slideCount }, (_, i) => ({
        narration: `Here is the ${ordinal(i + 1)} thing to know about ${topic}. It is simpler than it looks, and once you see it you cannot unsee it.`,
        caption: `${topic}, part ${i + 1}`,
        imagePrompt: `A cheerful storybook scene illustrating ${topic}, no text of any kind`,
      })),
    });
  }

  if (agent.startsWith('quiz-writer:')) {
    return mockQuizResponse(agent.slice('quiz-writer:'.length), user, chaos);
  }

  if (agent === 'encourager') {
    // Preamble, because real models sometimes add one.
    return `Here are the three messages:\n${JSON.stringify({
      high: 'You took that apart. Go tell someone what you worked out.',
      mid: 'Solid work — you got real ones right, and the rest is just the next thing to learn.',
      low: 'You tried every question, and that is where all of this starts. Run it again.',
    })}`;
  }

  throw new Error(`no mock response defined for agent "${agent}"`);
}

/**
 * Chaos targets the Nth call of each kind, so the counters have to be reset per
 * request — otherwise the second run of a stage injects its failures somewhere
 * else and the mock stops being reproducible.
 */
let quizCallIndex = 0;
let imageCallIndex = 0;
let audioCallIndex = 0;

export function resetMockCounters(): void {
  quizCallIndex = 0;
  imageCallIndex = 0;
  audioCallIndex = 0;
}

function mockQuizResponse(topic: string, user: string, chaos: boolean): string {
  const type = /type "(slider|single|multi|order)"/.exec(user)?.[1] ?? 'single';
  const call = quizCallIndex++;

  // Chaos: the 3rd writer (a `multi` group) forgets it was asked for JSON.
  if (chaos && call === 2) {
    return "I'd suggest asking the student about equivalent fractions here, perhaps with a visual aid.";
  }

  const base = {
    prompt: `Mock question about ${topic}`,
    explanation: `This is the mocked explanation for ${topic}.`,
  };

  switch (type) {
    case 'slider':
      return JSON.stringify({
        ...base,
        type: 'slider',
        config: { min: 0, max: 100, step: 5, unit: '%' },
        answerKey: {
          mode: 'numeric-tolerance',
          // Chaos: the 5th writer puts the answer off its own scale. Shape-valid,
          // so only the cross-field check in `superRefine` catches it.
          value: chaos && call === 4 ? 500 : 75,
          tolerance: 5,
        },
      });
    case 'multi':
      return JSON.stringify({
        ...base,
        type: 'multi',
        config: { options: ['First', 'Second', 'Third', 'Fourth'] },
        answerKey: { mode: 'index-set', correctIndices: [0, 2] },
      });
    case 'order':
      return JSON.stringify({
        ...base,
        type: 'order',
        config: { items: ['Third', 'First', 'Second'] },
        answerKey: { mode: 'exact-order', correctOrder: [1, 2, 0] },
      });
    default:
      return JSON.stringify({
        ...base,
        type: 'single',
        config: { options: ['Wrong', 'Right', 'Also wrong'] },
        answerKey: { mode: 'single-index', correctIndex: 1 },
      });
  }
}

/* ------------------------------------------------------------------ *
 * Asset responses
 * ------------------------------------------------------------------ */

/** A 1×1 transparent PNG — enough for the app to hold a real image URI. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function mockImageUrl(): string {
  // Chaos: the 2nd image fails, so the app has to fall back to caption-on-tint.
  if (mockMode() === 'chaos' && imageCallIndex++ === 1) {
    throw new Error('mock fal failure (ZING_MOCK=chaos)');
  }
  return `data:image/png;base64,${PIXEL_PNG}`;
}

/** A minimal MP3 frame header — a real Buffer for the Blob/data-URI path. */
export function mockAudioBytes(): Buffer {
  // Chaos: the 3rd clip fails, so that slide runs silent on the read-length timer.
  if (mockMode() === 'chaos' && audioCallIndex++ === 2) {
    throw new Error('mock elevenlabs failure (ZING_MOCK=chaos)');
  }
  return Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
}

/* ------------------------------------------------------------------ */

function fence(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function ordinal(n: number): string {
  return ['first', 'second', 'third', 'fourth'][n - 1] ?? `${n}th`;
}
