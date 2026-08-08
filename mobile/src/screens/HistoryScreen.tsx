import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { clearHistory, loadHistory, type HistoryEntry } from '../lib/history';

interface Props {
  onClose: () => void;
}

/** Past batches from AsyncStorage `zing.history` (ARCH §5). */
export function HistoryScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const refresh = useCallback(() => {
    void loadHistory().then(setEntries);
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Past batches</Text>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(entry) => `${entry.batchId}-${entry.timestamp}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nothing yet — go scan a worksheet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTopic} numberOfLines={2}>
                {item.topicSummary}
              </Text>
              <Text style={styles.cardScore}>
                {item.score}/{item.total}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              {item.difficulty} · {new Date(item.timestamp).toLocaleDateString()}
            </Text>
            <View style={styles.pips}>
              {item.perQuestion.map((question) => (
                <View
                  key={question.id}
                  style={[styles.pip, question.correct ? styles.pipCorrect : styles.pipWrong]}
                >
                  <Text style={styles.pipText}>{question.type[0].toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      />

      {entries.length ? (
        <Pressable
          onPress={() => void clearHistory().then(refresh)}
          accessibilityRole="button"
          style={[styles.clear, { marginBottom: insets.bottom + spacing.md }]}
        >
          <Text style={styles.clearText}>Clear history</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { ...type.prompt, color: colors.text },
  close: { ...type.body, color: colors.accent },
  list: { paddingBottom: spacing.xl },
  empty: { ...type.body, color: colors.textDim, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.bgLift,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTopic: { ...type.option, color: colors.text, flex: 1, marginRight: spacing.sm },
  cardScore: { ...type.option, color: colors.accent },
  cardMeta: { ...type.body, color: colors.textDim, marginTop: 2 },
  pips: { flexDirection: 'row', marginTop: spacing.sm },
  pip: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  pipCorrect: { backgroundColor: colors.correctSoft, borderWidth: 1, borderColor: colors.correct },
  pipWrong: { backgroundColor: colors.wrongSoft, borderWidth: 1, borderColor: colors.wrong },
  pipText: { ...type.body, fontSize: 11, color: colors.text, fontWeight: '800' },
  clear: { alignItems: 'center', paddingVertical: spacing.md },
  clearText: { ...type.body, color: colors.textDim, textDecorationLine: 'underline' },
});
