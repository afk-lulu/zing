import { useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { colors, radius, spacing, type } from '../theme';
import { correctAnswerLabel, gradeAnswer } from '../lib/grade';
import type { Answer, Question } from '../types/batch';
import { MultiChoiceQuestion } from './widgets/MultiChoiceQuestion';
import { OrderQuestion } from './widgets/OrderQuestion';
import { SingleChoiceQuestion } from './widgets/SingleChoiceQuestion';
import { SliderQuestion } from './widgets/SliderQuestion';

export interface RecordedAnswer {
  answer: Answer;
  correct: boolean;
}

interface Props {
  question: Question;
  questionNumber: number;
  questionTotal: number;
  height: number;
  width: number;
  /**
   * Set once this question has been answered. The FlatList unmounts pages that
   * scroll out of the window, so without this a child could scroll back and
   * answer the same question again — changing a score they already earned.
   */
  recorded?: RecordedAnswer;
  onAnswered: (question: Question, answer: Answer, correct: boolean) => void;
}

/**
 * A quiz page (ARCH §4): a bottom-anchored card holding the widget for this
 * question's type. Correct answers get a mini confetti burst, wrong ones a
 * shake plus the correct answer and the explanation — then the parent unlocks
 * scrolling.
 */
export function QuizPage({
  question,
  questionNumber,
  questionTotal,
  height,
  width,
  recorded,
  onAnswered,
}: Props) {
  const [answer, setAnswer] = useState<Answer | null>(recorded?.answer ?? null);
  const [correct, setCorrect] = useState<boolean | null>(recorded?.correct ?? null);
  /** Celebration is for the moment of answering, not for scrolling back past it. */
  const [justAnswered, setJustAnswered] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const answered = answer !== null;

  const submit = (given: Answer) => {
    if (answered) return;

    const isCorrect = gradeAnswer(question, given);
    setAnswer(given);
    setCorrect(isCorrect);
    setJustAnswered(true);

    if (!isCorrect) {
      Animated.sequence(
        [10, -9, 7, -5, 0].map((toValue) =>
          Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
        ),
      ).start();
    }

    onAnswered(question, given, isCorrect);
  };

  return (
    <View style={[styles.page, { height }]}>
      {justAnswered && correct === true ? (
        <ConfettiCannon
          count={40}
          origin={{ x: width / 2, y: height * 0.55 }}
          explosionSpeed={320}
          fallSpeed={2400}
          fadeOut
          autoStart
        />
      ) : null}

      <Animated.View style={[styles.card, { transform: [{ translateX: shake }] }]}>
        <Text style={styles.counter}>
          QUESTION {questionNumber} OF {questionTotal}
        </Text>
        <Text style={styles.prompt}>{question.prompt}</Text>

        <ScrollView
          style={styles.widgetScroll}
          contentContainerStyle={styles.widgetContent}
          showsVerticalScrollIndicator={false}
        >
          {renderWidget(question, answered, answer, submit)}

          {answered ? (
            <View
              style={[styles.feedback, correct ? styles.feedbackCorrect : styles.feedbackWrong]}
            >
              <Text style={styles.feedbackTitle}>
                {correct ? 'Yes! That’s it.' : `Not quite — it’s ${correctAnswerLabel(question)}`}
              </Text>
              <Text style={styles.feedbackBody}>{question.explanation}</Text>
              <Text style={styles.scrollHint}>Swipe up to keep going ↑</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function renderWidget(
  question: Question,
  answered: boolean,
  answer: Answer | null,
  submit: (answer: Answer) => void,
) {
  switch (question.type) {
    case 'slider':
      return <SliderQuestion question={question} answered={answered} onSubmit={submit} />;
    case 'single':
      return (
        <SingleChoiceQuestion
          question={question}
          answered={answered}
          chosenIndex={answer?.type === 'single' ? answer.index : null}
          onSubmit={submit}
        />
      );
    case 'multi':
      return (
        <MultiChoiceQuestion
          question={question}
          answered={answered}
          chosenIndices={answer?.type === 'multi' ? answer.indices : null}
          onSubmit={submit}
        />
      );
    case 'order':
      return (
        <OrderQuestion
          question={question}
          answered={answered}
          chosenOrder={answer?.type === 'order' ? answer.order : null}
          onSubmit={submit}
        />
      );
  }
}

const styles = StyleSheet.create({
  page: { width: '100%', backgroundColor: colors.bg, justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  counter: { ...type.label, color: colors.accent, marginBottom: spacing.sm },
  prompt: { ...type.prompt, color: colors.text, marginBottom: spacing.lg },
  widgetScroll: { flexGrow: 0 },
  widgetContent: { paddingBottom: spacing.xs },
  feedback: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  feedbackCorrect: { backgroundColor: colors.correctSoft, borderColor: colors.correct },
  feedbackWrong: { backgroundColor: colors.wrongSoft, borderColor: colors.wrong },
  feedbackTitle: { ...type.option, color: colors.text, marginBottom: spacing.xs },
  feedbackBody: { ...type.body, color: colors.text },
  scrollHint: { ...type.label, color: colors.textDim, marginTop: spacing.md },
});
