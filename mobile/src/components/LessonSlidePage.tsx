import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { colors, fill, slideFallbackTints, spacing, type } from '../theme';
import type { KenBurns, Slide } from '../types/batch';

interface Props {
  slide: Slide;
  /** Index in the flattened page list — picks the tint when there is no image. */
  pageIndex: number;
  height: number;
  active: boolean;
}

const KEN_BURNS_MS = 12_000;

/**
 * A lesson slide (ARCH §4): the prefetched image under a slow scale/translate
 * loop, with the caption drawn natively on top — never baked into the picture.
 */
export function LessonSlidePage({ slide, pageIndex, height, active }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: KEN_BURNS_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: KEN_BURNS_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  const tint = slideFallbackTints[pageIndex % slideFallbackTints.length];

  return (
    <View style={[styles.page, { height, backgroundColor: tint }]}>
      <Animated.View style={[styles.imageLayer, kenBurnsStyle(slide.kenBurns, progress)]}>
        {slide.imageUrl ? (
          <Image source={{ uri: slide.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          // No image: the caption still has to read, so the tint carries the page.
          <View style={[styles.image, { backgroundColor: tint }]} />
        )}
      </Animated.View>

      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.captionWrap} pointerEvents="none">
        <Text style={styles.caption}>{slide.caption}</Text>
      </View>
    </View>
  );
}

/** Each slide gets its own drift direction so consecutive slides don't feel identical. */
function kenBurnsStyle(kind: KenBurns, progress: Animated.Value) {
  switch (kind) {
    case 'zoom-in':
      return { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.16] }) }] };
    case 'zoom-out':
      return { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.16, 1.02] }) }] };
    case 'pan-left':
      return {
        transform: [
          { scale: 1.14 },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [26, -26] }) },
        ],
      };
    case 'pan-right':
      return {
        transform: [
          { scale: 1.14 },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-26, 26] }) },
        ],
      };
  }
}

const styles = StyleSheet.create({
  page: { width: '100%', justifyContent: 'flex-end' },
  imageLayer: { ...fill },
  image: { width: '100%', height: '100%' },
  scrim: {
    ...fill,
    backgroundColor: 'rgba(11, 11, 20, 0.34)',
  },
  captionWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  caption: {
    ...type.caption,
    color: colors.text,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
});
