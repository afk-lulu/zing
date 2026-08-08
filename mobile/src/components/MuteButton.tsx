import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  muted: boolean;
  onToggle: () => void;
}

/** Persistent mute, alongside the progress dots (ARCH §4). */
export function MuteButton({ muted, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: muted }}
      accessibilityLabel={muted ? 'Unmute narration' : 'Mute narration'}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.glyph}>{muted ? '🔇' : '🔊'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(11, 11, 20, 0.55)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  glyph: { ...type.body, fontSize: 16 },
});
