import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, type } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** The confirm button shared by the widgets that need one (slider, multi, order). */
export function AnswerButton({ label, onPress, disabled = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { backgroundColor: colors.hairline },
  label: { ...type.option, color: colors.text, fontSize: 18 },
  labelDisabled: { color: colors.textDim },
});
