import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, spacing, type } from '../../theme';
import type { Answer, SliderQuestion as SliderQuestionSpec } from '../../types/batch';
import { AnswerButton } from './AnswerButton';

interface Props {
  question: SliderQuestionSpec;
  answered: boolean;
  onSubmit: (answer: Answer) => void;
}

/**
 * `slider` — @react-native-community/slider (works in Expo Go) with a big live
 * readout, so the child sees the number change as they drag (ARCH §4).
 */
export function SliderQuestion({ question, answered, onSubmit }: Props) {
  const { min, max, step, unit } = question.config;
  const [value, setValue] = useState(() => roundToStep((min + max) / 2, min, step));

  const shown = answered ? question.answerKey.value : value;

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutValue}>{formatValue(shown)}</Text>
        {unit ? <Text style={styles.readoutUnit}>{unit}</Text> : null}
      </View>

      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={shown}
        disabled={answered}
        onValueChange={(next) => setValue(roundToStep(next, min, step))}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.hairline}
        thumbTintColor={colors.text}
      />

      <View style={styles.bounds}>
        <Text style={styles.boundLabel}>
          {formatValue(min)}
          {unit}
        </Text>
        <Text style={styles.boundLabel}>
          {formatValue(max)}
          {unit}
        </Text>
      </View>

      {!answered ? (
        <AnswerButton label="Lock it in" onPress={() => onSubmit({ type: 'slider', value })} />
      ) : null}
    </View>
  );
}

function roundToStep(raw: number, min: number, step: number): number {
  if (step <= 0) return raw;
  return min + Math.round((raw - min) / step) * step;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  readout: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  readoutValue: { ...type.score, color: colors.text },
  readoutUnit: {
    ...type.prompt,
    color: colors.accent,
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  slider: { width: '100%', height: 44 },
  bounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  boundLabel: { ...type.body, color: colors.textDim },
});
