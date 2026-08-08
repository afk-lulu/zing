import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  paused: boolean;
  onToggle: () => void;
}

/** Freezes the slide in place — voice, karaoke and Ken Burns all stop together. */
function PlayPauseButtonImpl({ paused, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Resume the lesson' : 'Pause the lesson'}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.glyph}>{paused ? '▶' : '❚❚'}</Text>
    </Pressable>
  );
}

/** Memoised for the same reason as `MuteButton`: the player re-renders at 10Hz. */
export const PlayPauseButton = memo(PlayPauseButtonImpl);

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(4, 7, 10, 0.55)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
    // The two glyphs have different widths; a floor keeps the button from
    // twitching as it toggles, and the mute button beside it from sliding.
    minWidth: 44,
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
  glyph: { ...type.body, fontSize: 15, color: colors.text },
});
