import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { STAGE_SCRIPT, type StageId } from '../lib/api';

interface Props {
  stage: StageId;
}

/**
 * Generating (ARCH §1): drives nothing itself — it narrates the agents as they
 * actually run. Each line lights up when its stage starts, so the progress is
 * real rather than a simulated timeline.
 */
export function GeneratingScreen({ stage }: Props) {
  const insets = useSafeAreaInsets();
  const currentIndex = Math.max(
    0,
    STAGE_SCRIPT.findIndex((entry) => entry.id === stage),
  );

  const pulse = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (currentIndex + 1) / STAGE_SCRIPT.length,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentIndex, progress]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.label}>BUILDING YOUR BATCH</Text>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      <View style={styles.list}>
        {STAGE_SCRIPT.map((entry, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <View key={entry.id} style={styles.row}>
              <Animated.View
                style={[
                  styles.bullet,
                  done && styles.bulletDone,
                  active && styles.bulletActive,
                  active && { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
                ]}
              />
              <View style={styles.rowText}>
                <Text style={[styles.agent, (done || active) && styles.agentLit]}>{entry.agent}</Text>
                <Text style={[styles.line, active && styles.lineActive]}>{entry.line}</Text>
              </View>
              {done ? <Text style={styles.tick}>✓</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  label: { ...type.label, color: colors.accent, marginBottom: spacing.md },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  bullet: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    marginRight: spacing.md,
  },
  bulletDone: { backgroundColor: colors.correct },
  bulletActive: { backgroundColor: colors.accent },
  rowText: { flex: 1 },
  agent: { ...type.label, color: colors.hairline },
  agentLit: { color: colors.textDim },
  line: { ...type.option, color: colors.textDim, marginTop: 2 },
  lineActive: { color: colors.text },
  tick: { ...type.option, color: colors.correct },
});
