import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@/theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  includeBottomInset?: boolean;
};

export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  includeBottomInset = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.lg,
    paddingBottom: (includeBottomInset ? insets.bottom : 0) + space.xl,
    paddingHorizontal: space.lg,
  };

  if (!scroll) {
    return (
      <View style={[styles.fill, padding]}>
        <View style={styles.column}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sage}
            colors={[colors.sage]}
          />
        ) : undefined
      }
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.lg },
});
