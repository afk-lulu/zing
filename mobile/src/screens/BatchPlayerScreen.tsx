import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, fill, radius, spacing, type } from '../theme';
import { buildPages, questionCount, type Page } from '../lib/pages';
import { recordBatch } from '../lib/history';
import { LessonSlidePage } from '../components/LessonSlidePage';
import { MuteButton } from '../components/MuteButton';
import { ProgressDots } from '../components/ProgressDots';
import { QuizPage, type RecordedAnswer } from '../components/QuizPage';
import { ScoreCardPage } from '../components/ScoreCardPage';
import type { Answer, BatchSpec, Question } from '../types/batch';

interface Props {
  batch: BatchSpec;
  onMakeItHarder: () => void;
  onDone: () => void;
  makeItHarderBusy: boolean;
}

/**
 * The Batch Player (ARCH §4). A vertical paging FlatList of full-screen pages
 * with a per-page state machine: playing → question → feedback → playing → …
 * → scorecard.
 */
export function BatchPlayerScreen({ batch, onMakeItHarder, onDone, makeItHarderBusy }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const pages = useMemo(() => buildPages(batch), [batch]);
  const totalQuestions = questionCount(batch);

  const listRef = useRef<FlatList<Page>>(null);
  const [index, setIndex] = useState(0);
  /** Nothing plays until the child taps — iPhone will not autoplay audio (ARCH §4). */
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [results, setResults] = useState<Map<string, RecordedAnswer>>(new Map());
  const persisted = useRef(false);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const page = pages[index];
  const activeSlide = page?.kind === 'slide' ? page.slide : null;
  const answeredHere = page?.kind === 'quiz' ? results.has(page.question.id) : true;

  // iPhones ship with the silent switch on more often than not — without this
  // the whole demo is mute (ARCH §7).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // Not fatal: captions carry the batch if the mode can't be set.
    });
  }, []);

  // Mirrored in a ref so `advance` can scroll without re-creating itself on
  // every page change (it is a dependency of the audio effects).
  const indexRef = useRef(0);

  const advance = useCallback(() => {
    const next = Math.min(indexRef.current + 1, pages.length - 1);
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, [pages.length]);

  // Load and play the active slide's clip; a quiz or scorecard page pauses it.
  useEffect(() => {
    if (!started) return;

    if (activeSlide?.audioUrl) {
      try {
        player.replace(activeSlide.audioUrl);
        player.muted = muted;
        player.play();
      } catch {
        // A clip that won't load just means this slide runs on the timer below.
      }
    } else {
      player.pause();
    }
  }, [started, activeSlide, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  // Clip end auto-advances the feed (ARCH §4).
  useEffect(() => {
    if (!started || !activeSlide?.audioUrl) return;
    if (status.didJustFinish) advance();
  }, [status.didJustFinish, started, activeSlide, advance]);

  // Silent slide (ElevenLabs cut, or the bundled fallback batch): advance on a
  // read-length timer instead, so the feed still moves on its own.
  useEffect(() => {
    if (!started || !activeSlide || activeSlide.audioUrl) return;
    const timer = setTimeout(advance, estimateNarrationMs(activeSlide.narration));
    return () => clearTimeout(timer);
  }, [started, activeSlide, advance]);

  const onAnswered = useCallback((question: Question, answer: Answer, correct: boolean) => {
    setResults((current) => new Map(current).set(question.id, { answer, correct }));
  }, []);

  // Persist once, when the scorecard first comes into view.
  useEffect(() => {
    if (page?.kind !== 'scorecard' || persisted.current) return;
    persisted.current = true;
    void recordBatch(batch, new Map([...results].map(([id, r]) => [id, r.correct])));
  }, [page, batch, results]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.y / height);
      indexRef.current = next;
      setIndex(next);
    },
    [height],
  );

  const score = useMemo(
    () => [...results.values()].filter((result) => result.correct).length,
    [results],
  );

  const renderPage = useCallback(
    ({ item, index: pageIndex }: { item: Page; index: number }) => {
      switch (item.kind) {
        case 'slide':
          return (
            <LessonSlidePage
              slide={item.slide}
              pageIndex={pageIndex}
              height={height}
              active={started && pageIndex === index}
            />
          );
        case 'quiz':
          return (
            <QuizPage
              question={item.question}
              questionNumber={item.groupIndex + 1}
              questionTotal={totalQuestions}
              height={height}
              width={width}
              recorded={results.get(item.question.id)}
              onAnswered={onAnswered}
            />
          );
        case 'scorecard':
          return (
            <ScoreCardPage
              batch={batch}
              score={score}
              total={totalQuestions}
              height={height}
              width={width}
              onMakeItHarder={onMakeItHarder}
              onDone={onDone}
              makeItHarderBusy={makeItHarderBusy}
            />
          );
      }
    },
    [
      batch,
      height,
      index,
      makeItHarderBusy,
      onAnswered,
      onDone,
      onMakeItHarder,
      results,
      score,
      started,
      totalQuestions,
      width,
    ],
  );

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => item.key}
        renderItem={renderPage}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        // Locked while a question is unanswered — the child answers, then scrolls.
        scrollEnabled={answeredHere}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        decelerationRate="fast"
        windowSize={3}
        initialNumToRender={2}
      />

      <View style={[styles.hud, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <ProgressDots total={pages.length} index={index} />
        <MuteButton muted={muted} onToggle={() => setMuted((m) => !m)} />
      </View>

      {!started ? (
        <Pressable
          style={styles.startOverlay}
          accessibilityRole="button"
          onPress={() => setStarted(true)}
        >
          <View style={styles.startCard}>
            <Text style={styles.startTitle}>{batch.topicSummary}</Text>
            <Text style={styles.startBody}>
              {totalQuestions} questions · swipe up to move through the feed
            </Text>
            <View style={styles.startPill}>
              <Text style={styles.startPillText}>Tap to start</Text>
            </View>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

/** ~2.6 words a second, clamped, for slides that have no clip to end on. */
function estimateNarrationMs(narration: string): number {
  const words = narration.trim().split(/\s+/).length;
  return Math.min(15_000, Math.max(6_000, Math.round((words / 2.6) * 1000)));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hud: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startOverlay: {
    ...fill,
    backgroundColor: 'rgba(11, 11, 20, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  startCard: { alignItems: 'center' },
  startTitle: { ...type.caption, color: colors.text, textAlign: 'center' },
  startBody: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  startPill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  startPillText: { ...type.option, color: colors.text, fontSize: 18 },
});
