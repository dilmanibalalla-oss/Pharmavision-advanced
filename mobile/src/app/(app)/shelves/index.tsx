import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { can } from '@/access';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { AppText } from '@/components/AppText';
import { useAuthStore } from '@/store/authStore';
import type { ShelfRecord } from '@/types';

export default function ShelfListScreen() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const [query, setQuery] = useState('');
  const [shelves, setShelves] = useState<ShelfRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const page = await operationsApi.shelves(q.trim());
      setShelves(page.shelves);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!can(role, 'shelves')) return;
    load('');
  }, [load, role]);

  if (!can(role, 'shelves')) {
    return (
      <Screen>
        <StackHeader title="Shelves" />
        <EmptyState title="Shelves are not available" body="Your role cannot read shelf records." />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => load(query)} refreshing={loading}>
      <StackHeader title="Shelves" subtitle="Registered shelves from the clinic server." />
      {can(role, 'shelfWrite') ? <Button label="Register a shelf" onPress={() => router.push('/shelves/register')} /> : null}
      <TextField label="Search" value={query} onChangeText={setQuery} autoCapitalize="none" />
      <Button label="Search" tone="secondary" onPress={() => load(query)} />
      {error ? <Banner message={error} /> : null}
      {loading ? <LoadingState label="Loading shelves" /> : null}
      {!loading && shelves.length === 0 ? <EmptyState title="No shelves" body="Registered shelves will show here." /> : null}
      {shelves.map((shelf) => (
        <Pressable key={shelf._id} onPress={() => router.push(`/shelves/${shelf._id}`)}>
          <Card>
            <AppText variant="label">{shelf.name}</AppText>
            <AppText variant="caption" tone="soft">
              {shelf.shelfCode} · {shelf.location} · {shelf.calibration?.status || 'UNSET'}
            </AppText>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
