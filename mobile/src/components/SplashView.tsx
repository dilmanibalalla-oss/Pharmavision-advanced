import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { colors, radius, space } from '@/theme';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function SplashView({ message, onRetry }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.mark}>
        <AppText variant="heading" tone="inverse">
          Pv
        </AppText>
      </View>
      <AppText variant="display" tone="inverse" style={styles.center}>
        PharmaVision
      </AppText>
      <AppText variant="body" tone="inverse" style={styles.dim}>
        Clinic and dispensary
      </AppText>
      <View style={styles.status}>
        {message ? (
          <AppText variant="body" tone="inverse" style={styles.center}>
            {message}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.copper} />
        )}
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <AppText variant="button" tone="rail">
              Try again
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.rail,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  center: { textAlign: 'center' },
  dim: { color: colors.railDim, textAlign: 'center' },
  status: { marginTop: space.xl, alignItems: 'center', gap: space.lg, minHeight: 80 },
  retry: {
    backgroundColor: colors.paper2,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
