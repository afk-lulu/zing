import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BatchSpec, Difficulty, QuestionType } from '../types/batch';

/** ARCH §5 — `zing.history` in AsyncStorage. */
const STORAGE_KEY = 'zing.history';
const MAX_ENTRIES = 50;

export interface HistoryQuestion {
  id: string;
  type: QuestionType;
  correct: boolean;
}

export interface HistoryEntry {
  batchId: string;
  topicSummary: string;
  difficulty: Difficulty;
  score: number;
  total: number;
  perQuestion: HistoryQuestion[];
  timestamp: number;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    // History is the first thing on the ARCH §6 cut list — never let it throw
    // into the player.
    return [];
  }
}

export async function recordBatch(
  batch: BatchSpec,
  results: Map<string, boolean>,
): Promise<void> {
  try {
    const perQuestion: HistoryQuestion[] = batch.groups.map((group) => ({
      id: group.quiz.id,
      type: group.quiz.type,
      correct: results.get(group.quiz.id) === true,
    }));

    const entry: HistoryEntry = {
      batchId: batch.batchId,
      topicSummary: batch.topicSummary,
      difficulty: batch.difficulty,
      score: perQuestion.filter((q) => q.correct).length,
      total: perQuestion.length,
      perQuestion,
      timestamp: Date.now(),
    };

    const existing = await loadHistory();
    const next = [entry, ...existing.filter((e) => e.batchId !== entry.batchId)].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Same reason: a failed write must not interrupt the scorecard.
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignored
  }
}
