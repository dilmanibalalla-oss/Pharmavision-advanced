import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors, radius, space } from '@/theme';

type Props = {
  label: string;
  value: string;
};

export function StatTile({ label, value }: Props) {
  return (
    <View style={styles.tile}>
      <AppText variant="caption" tone="soft">
        {label}
      </AppText>
      <AppText variant="heading">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.paper2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: space.xs,
  },
});
