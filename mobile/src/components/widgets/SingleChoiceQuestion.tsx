import { View } from 'react-native';
import type { Answer, SingleQuestion } from '../../types/batch';
import { OptionRow, type OptionState } from './OptionRow';

interface Props {
  question: SingleQuestion;
  answered: boolean;
  chosenIndex: number | null;
  onSubmit: (answer: Answer) => void;
}

/** `single` — tapping an option is the answer; no confirm step (ARCH §4). */
export function SingleChoiceQuestion({ question, answered, chosenIndex, onSubmit }: Props) {
  const correctIndex = question.answerKey.correctIndex;

  return (
    <View>
      {question.config.options.map((option, index) => (
        <OptionRow
          key={`${index}-${option}`}
          label={option}
          disabled={answered}
          state={stateFor(index, answered, chosenIndex, correctIndex)}
          onPress={() => onSubmit({ type: 'single', index })}
        />
      ))}
    </View>
  );
}

function stateFor(
  index: number,
  answered: boolean,
  chosenIndex: number | null,
  correctIndex: number,
): OptionState {
  if (!answered) return chosenIndex === index ? 'selected' : 'idle';
  if (index === correctIndex) return 'correct';
  if (index === chosenIndex) return 'wrong';
  return 'idle';
}
