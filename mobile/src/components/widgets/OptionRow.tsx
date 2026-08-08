import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../../theme';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong';

interface Props {
  label: string;
  state: OptionState;
  disabled?: boolean;
  onPress: () => void;
  /** Selection marker: a checkbox tick, or an order badge like "2". */
  badge?: ReactNode;
}

/** The shared option row behind `single`, `multi` and `order`. */
export function OptionRow({ label, state, disabled = false, onPress, badge }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state !== 'idle' }}
      style={({ pressed }) => [
        styles.row,
        state === 'selected' && styles.selected,
        state === 'correct' && styles.correct,
        state === 'wrong' && styles.wrong,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgLift,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.hairline,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  correct: { borderColor: colors.correct, backgroundColor: colors.correctSoft },
  wrong: { borderColor: colors.wrong, backgroundColor: colors.wrongSoft },
  badgeSlot: { marginRight: spacing.sm },
  label: { ...type.option, color: colors.text, flex: 1 },
});
