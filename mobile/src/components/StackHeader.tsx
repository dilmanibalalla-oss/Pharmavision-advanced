import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { space } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
};

export function StackHeader({ title, subtitle }: Props) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
        <AppText variant="label" tone="sage">
          Back
        </AppText>
      </Pressable>
      <AppText variant="title">{title}</AppText>
      {subtitle ? (
        <AppText variant="body" tone="soft">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
