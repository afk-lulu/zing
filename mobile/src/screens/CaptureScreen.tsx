import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { captureFromCamera, pickFromLibrary, pickPdf, WorksheetError } from '../lib/worksheet';
import type { WorksheetSource } from '../lib/api';
import type { Difficulty } from '../types/batch';

interface Props {
  onWorksheet: (source: WorksheetSource, difficulty: Difficulty) => void;
  onOpenHistory: () => void;
}

const DIFFICULTIES: { value: Difficulty; label: string; blurb: string }[] = [
  { value: 'easy', label: 'Easy', blurb: 'One step at a time' },
  { value: 'on-level', label: 'On level', blurb: 'Just right for the grade' },
  { value: 'challenge', label: 'Challenge', blurb: 'Multi-step, tricky options' },
];

/** Capture (ARCH §1): camera, PDF picker, difficulty selector. */
export function CaptureScreen({ onWorksheet, onOpenHistory }: Props) {
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState<Difficulty>('on-level');
  const [busy, setBusy] = useState(false);

  const run = async (pick: () => Promise<WorksheetSource | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      const source = await pick();
      if (source) onWorksheet(source, difficulty);
    } catch (error) {
      Alert.alert(
        'Could not read that',
        error instanceof WorksheetError ? error.message : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.wordmark}>zing</Text>
      <Text style={styles.tagline}>
        Point at today’s worksheet. Get it back as a feed you can actually scroll.
      </Text>

      <Text style={styles.sectionLabel}>HOW HARD?</Text>
      <View style={styles.difficultyRow}>
        {DIFFICULTIES.map((option) => {
          const selected = option.value === difficulty;
          return (
            <Pressable
              key={option.value}
              onPress={() => setDifficulty(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.difficulty,
                selected && styles.difficultySelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.difficultyBlurb}>{option.blurb}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>WHAT ARE WE LEARNING?</Text>
      <Pressable
        onPress={() => run(captureFromCamera)}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>📸  Take a photo of the worksheet</Text>
      </Pressable>

      <Pressable
        onPress={() => run(pickFromLibrary)}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>🖼️  Choose a photo</Text>
      </Pressable>

      <Pressable
        onPress={() => run(pickPdf)}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>📄  Pick a PDF</Text>
      </Pressable>

      <Pressable onPress={onOpenHistory} accessibilityRole="button" style={styles.historyLink}>
        <Text style={styles.historyText}>Past batches</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  wordmark: {
    ...type.score,
    color: colors.text,
    letterSpacing: -2,
    marginBottom: spacing.xs,
  },
  tagline: { ...type.option, color: colors.textDim, marginBottom: spacing.xl },
  sectionLabel: { ...type.label, color: colors.accent, marginBottom: spacing.sm },
  difficultyRow: { flexDirection: 'row', marginBottom: spacing.xl },
  difficulty: {
    flex: 1,
    backgroundColor: colors.bgLift,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.hairline,
    padding: spacing.sm,
    marginRight: spacing.xs,
  },
  difficultySelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  difficultyLabel: { ...type.body, color: colors.textDim, fontWeight: '800' },
  difficultyLabelSelected: { color: colors.text },
  difficultyBlurb: { ...type.body, fontSize: 12, lineHeight: 16, color: colors.textDim, marginTop: 2 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { ...type.option, color: colors.text, fontSize: 18 },
  secondary: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryText: { ...type.option, color: colors.textDim },
  pressed: { opacity: 0.85 },
  historyLink: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  historyText: { ...type.body, color: colors.textDim, textDecorationLine: 'underline' },
});
