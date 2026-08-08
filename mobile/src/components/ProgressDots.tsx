import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  total: number;
  index: number;
}

/** Persistent progress dots across the whole feed (ARCH §4). */
function ProgressDotsImpl({ total, index }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i === index && styles.current, i < index && styles.done]}
        />
      ))}
    </View>
  );
}

/**
 * Memoised: the player re-renders ten times a second while a clip plays, and
 * this sits outside the list where nothing else would stop it following.
 */
export const ProgressDots = memo(ProgressDotsImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    marginHorizontal: 2.5,
    backgroundColor: 'rgba(242, 251, 250, 0.28)',
  },
  done: { backgroundColor: colors.textDim },
  current: { width: 18, backgroundColor: colors.text },
});
