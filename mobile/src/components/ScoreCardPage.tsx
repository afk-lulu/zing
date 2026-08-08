import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { colors, confettiColors, radius, spacing, type } from '../theme';
import { scoreBand } from '../lib/grade';
import type { BatchSpec } from '../types/batch';

interface Props {
  batch: BatchSpec;
  score: number;
  /** Longest run of consecutive correct answers (PRD §3). */
  streak: number;
  total: number;
  /** Questions swiped past and never answered — still open on a scroll back. */
  skipped: number;
  height: number;
  width: number;
  onMakeItHarder: () => void;
  onDone: () => void;
  makeItHarderBusy: boolean;
}

/**
 * The ScoreCard (ARCH §4): full confetti burst, score, subject chips, the
 * encouragement picked by score band, then **Make it harder** and **Done**.
 */
export function ScoreCardPage({
  batch,
  score,
  streak,
  total,
  skipped,
  height,
  width,
  onMakeItHarder,
  onDone,
  makeItHarderBusy,
}: Props) {
  const cannon = useRef<ConfettiCannon>(null);
  const band = scoreBand(score, total);

  return (
    <View style={[styles.page, { height }]}>
      <ConfettiCannon
        ref={cannon}
        count={160}
        origin={{ x: width / 2, y: -20 }}
        explosionSpeed={420}
        fallSpeed={3200}
        colors={confettiColors}
        fadeOut
        autoStart
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>YOU FINISHED</Text>
        <Text style={styles.topic}>{batch.topicSummary}</Text>

        <View style={styles.scoreRow}>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.scoreTotal}>/{total}</Text>
        </View>

        {/* One correct answer is not a run — say nothing rather than "1 in a row". */}
        {streak > 1 ? <Text style={styles.streak}>🔥 {streak} in a row</Text> : null}

        {/* Skipped questions are still answerable: the feed scrolls both ways,
            so this is an invitation rather than a scold. */}
        {skipped > 0 ? (
          <Text style={styles.skipped}>
            {skipped} skipped — swipe down ↓ to go back and try {skipped === 1 ? 'it' : 'them'}
          </Text>
        ) : null}

        <View style={styles.chips}>
          {batch.subjects.map((subject) => (
            <View key={subject} style={styles.chip}>
              <Text style={styles.chipText}>{subject}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.encouragement}>{batch.encouragement[band]}</Text>

        <Pressable
          onPress={onMakeItHarder}
          disabled={makeItHarderBusy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>
            {makeItHarderBusy ? 'Building a harder one…' : 'Make it harder'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  label: { ...type.label, color: colors.accent, textAlign: 'center' },
  topic: { ...type.prompt, color: colors.text, textAlign: 'center', marginTop: spacing.xs },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  score: { ...type.score, color: colors.text },
  scoreTotal: { ...type.prompt, color: colors.textDim, marginBottom: spacing.md },
  streak: {
    ...type.body,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  skipped: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  chip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    margin: spacing.xs / 2,
  },
  chipText: { ...type.body, color: colors.text },
  encouragement: {
    ...type.option,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { ...type.option, color: colors.onAccent, fontSize: 18 },
  secondary: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryText: { ...type.option, color: colors.textDim },
  pressed: { opacity: 0.85 },
});
