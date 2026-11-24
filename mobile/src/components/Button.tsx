import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors, radius, space } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
};

export function Button({ label, onPress, loading = false, disabled = false, tone = 'primary' }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        tone === 'primary' && styles.primary,
        tone === 'secondary' && styles.secondary,
        tone === 'danger' && styles.danger,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'secondary' ? colors.rail : colors.white} />
      ) : (
        <AppText variant="button" tone={tone === 'secondary' ? 'rail' : 'inverse'}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primary: { backgroundColor: colors.sage },
  secondary: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.rose },
  inactive: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
