import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors, space } from '@/theme';

export function LoadingState({ label = 'Loading clinic records' }: { label?: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.sage} />
      <AppText variant="body" tone="soft">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xxl },
});
