/**
 * The Batch Spec (ARCH §3) as the app sees it.
 *
 * Source of truth is the Zod schema at `api/lib/schema.ts`. These are a plain
 * TypeScript mirror — Expo Go runs Metro straight off this folder, and a shared
 * workspace package buys nothing at POC size. If you change a shape there,
 * change it here.
 */

export type Difficulty = 'easy' | 'on-level' | 'challenge';

export type QuestionType = 'slider' | 'single' | 'multi' | 'order';

export type KenBurns = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export interface Slide {
  /** Absent when fal failed or the batch came from the offline fallback. */
  imageUrl?: string;
  /** Absent when ElevenLabs failed — the slide plays silent with its caption. */
  audioUrl?: string;
  narration: string;
  caption: string;
  imagePrompt: string;
  kenBurns: KenBurns;
}

export interface Lesson {
  slides: Slide[];
}

export interface SliderQuestion {
  id: string;
  type: 'slider';
  prompt: string;
  config: { min: number; max: number; step: number; unit: string };
  answerKey: { mode: 'numeric-tolerance'; value: number; tolerance: number };
  explanation: string;
}

export interface SingleQuestion {
  id: string;
  type: 'single';
  prompt: string;
  config: { options: string[] };
  answerKey: { mode: 'single-index'; correctIndex: number };
  explanation: string;
}

export interface MultiQuestion {
  id: string;
  type: 'multi';
  prompt: string;
  config: { options: string[] };
  answerKey: { mode: 'index-set'; correctIndices: number[] };
  explanation: string;
}

export interface OrderQuestion {
  id: string;
  type: 'order';
  prompt: string;
  config: { items: string[] };
  answerKey: { mode: 'exact-order'; correctOrder: number[] };
  explanation: string;
}

export type Question = SliderQuestion | SingleQuestion | MultiQuestion | OrderQuestion;

export interface Group {
  lessons: Lesson[];
  quiz: Question;
}

export interface Encouragement {
  high: string;
  mid: string;
  low: string;
}

export interface BatchSpec {
  batchId: string;
  topicSummary: string;
  subjects: string[];
  difficulty: Difficulty;
  encouragement: Encouragement;
  groups: Group[];
}

/** What the child did on one question, per question type. */
export type Answer =
  | { type: 'slider'; value: number }
  | { type: 'single'; index: number }
  | { type: 'multi'; indices: number[] }
  | { type: 'order'; order: number[] };
