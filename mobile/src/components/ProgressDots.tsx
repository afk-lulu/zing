import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  total: number;
  index: number;
}

/** Persistent progress dots across the whole feed (ARCH §4). */
export function ProgressDots({ total, index }: Props) {
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    marginHorizontal: 2.5,
    backgroundColor: 'rgba(246, 245, 255, 0.28)',
  },
  done: { backgroundColor: colors.textDim },
  current: { width: 18, backgroundColor: colors.text },
});
