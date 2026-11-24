import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { space } from '@/theme';

type Props = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="heading">{title}</AppText>
      <AppText variant="body" tone="soft">
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingVertical: space.lg },
});
