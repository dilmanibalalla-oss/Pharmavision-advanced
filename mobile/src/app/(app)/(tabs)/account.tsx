import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { roleLabel } from '@/access';
import { useAuthStore } from '@/store/authStore';

export default function AccountScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  return (
    <Screen>
      <AppText variant="title">{user?.name || 'Account'}</AppText>
      <AppText variant="body" tone="soft">
        {user?.email} · {roleLabel(user?.role)}
      </AppText>
      <Card>
        <AppText variant="body" tone="soft">
          Session tokens stay in secure storage. Shelf photos and scan results are not saved as a local medical record.
        </AppText>
        <Button label="Profile" tone="secondary" onPress={() => router.push('/profile')} />
        <Button label="Settings" tone="secondary" onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}
