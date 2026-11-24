import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors, radius, space } from '@/theme';

type Props = {
  message: string;
  tone?: 'danger' | 'info' | 'ok';
};

export function Banner({ message, tone = 'danger' }: Props) {
  return (
    <View style={[styles.banner, tone === 'danger' && styles.danger, tone === 'info' && styles.info, tone === 'ok' && styles.ok]}>
      <AppText variant="body" tone={tone === 'danger' ? 'danger' : tone === 'ok' ? 'sage' : 'rail'}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
  },
  danger: { backgroundColor: colors.roseWash, borderColor: '#e7c4bd' },
  info: { backgroundColor: colors.sageWash, borderColor: '#c9e0d9' },
  ok: { backgroundColor: colors.sageWash, borderColor: '#c9e0d9' },
});
