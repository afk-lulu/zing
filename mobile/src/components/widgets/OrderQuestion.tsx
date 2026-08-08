import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, type } from '../../theme';
import type { Answer, OrderQuestion as OrderQuestionSpec } from '../../types/batch';
import { AnswerButton } from './AnswerButton';
import { OptionRow, type OptionState } from './OptionRow';

interface Props {
  question: OrderQuestionSpec;
  answered: boolean;
  chosenOrder: number[] | null;
  onSubmit: (answer: Answer) => void;
}

/**
 * `order` — tap-to-order (ARCH §4): tap items in sequence, a numbered badge
 * appears, re-tap to undo. No drag libraries, which keeps it working in Expo Go
 * and keeps the gesture from fighting the vertical pager.
 */
export function OrderQuestion({ question, answered, chosenOrder, onSubmit }: Props) {
  const [order, setOrder] = useState<number[]>([]);
  const shown = answered ? (chosenOrder ?? []) : order;
  const correct = question.answerKey.correctOrder;
  const complete = order.length === question.config.items.length;

  const tap = (index: number) => {
    setOrder((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  };

  return (
    <View>
      {question.config.items.map((item, index) => {
        const position = shown.indexOf(index);
        return (
          <OptionRow
            key={`${index}-${item}`}
            label={item}
            disabled={answered}
            state={stateFor(index, answered, shown, correct)}
            onPress={() => tap(index)}
            badge={
              <View style={[styles.badge, position >= 0 && styles.badgeOn]}>
                <Text style={[styles.badgeText, position >= 0 && styles.badgeTextOn]}>
                  {position >= 0 ? position + 1 : '·'}
                </Text>
              </View>
            }
          />
        );
      })}

      {!answered ? (
        <AnswerButton
          label={complete ? 'Check my order' : `Tap them in order (${order.length}/${question.config.items.length})`}
          disabled={!complete}
          onPress={() => onSubmit({ type: 'order', order })}
        />
      ) : null}
    </View>
  );
}

/** Once answered, a slot is green only if the child put that item in the right place. */
function stateFor(
  index: number,
  answered: boolean,
  shown: number[],
  correct: number[],
): OptionState {
  if (!answered) return shown.includes(index) ? 'selected' : 'idle';
  return correct[shown.indexOf(index)] === index ? 'correct' : 'wrong';
}

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  badgeText: { ...type.body, color: colors.textDim, fontWeight: '900' },
  badgeTextOn: { color: colors.text },
});
