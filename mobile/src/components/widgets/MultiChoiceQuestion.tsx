import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, type } from '../../theme';
import type { Answer, MultiQuestion } from '../../types/batch';
import { AnswerButton } from './AnswerButton';
import { OptionRow, type OptionState } from './OptionRow';

interface Props {
  question: MultiQuestion;
  answered: boolean;
  chosenIndices: number[] | null;
  onSubmit: (answer: Answer) => void;
}

/**
 * `multi` — option rows plus a confirm, because the child has to be able to
 * change their mind before committing a whole set (ARCH §4).
 */
export function MultiChoiceQuestion({ question, answered, chosenIndices, onSubmit }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const shown = answered ? (chosenIndices ?? []) : selected;
  const correct = question.answerKey.correctIndices;

  const toggle = (index: number) => {
    setSelected((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  };

  return (
    <View>
      {question.config.options.map((option, index) => (
        <OptionRow
          key={`${index}-${option}`}
          label={option}
          disabled={answered}
          state={stateFor(index, answered, shown, correct)}
          onPress={() => toggle(index)}
          badge={
            <View style={[styles.checkbox, shown.includes(index) && styles.checkboxOn]}>
              {shown.includes(index) ? <Text style={styles.tick}>✓</Text> : null}
            </View>
          }
        />
      ))}

      {!answered ? (
        <AnswerButton
          label={selected.length ? `Check ${selected.length} answer${selected.length === 1 ? '' : 's'}` : 'Pick at least one'}
          disabled={selected.length === 0}
          onPress={() => onSubmit({ type: 'multi', indices: [...selected].sort((a, b) => a - b) })}
        />
      ) : null}
    </View>
  );
}

function stateFor(
  index: number,
  answered: boolean,
  shown: number[],
  correct: number[],
): OptionState {
  if (!answered) return shown.includes(index) ? 'selected' : 'idle';
  if (correct.includes(index)) return 'correct';
  if (shown.includes(index)) return 'wrong';
  return 'idle';
}

const styles = StyleSheet.create({
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  tick: { ...type.body, color: colors.text, fontWeight: '900' },
});
