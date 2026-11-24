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
import { AppText } from '@/components/AppText';
import { formatWhen, labelize } from '@/format';
import { useAuthStore } from '@/store/authStore';
import type { ScanRecord } from '@/types';

export default function ScanHistoryScreen() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await operationsApi.scans(nextPage);
      setScans(result.scans);
      setPage(result.page);
      setPages(result.pages);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (can(role, 'scans')) load(1);
  }, [load, role]);

  if (!can(role, 'scans')) {
    return (
      <Screen>
        <StackHeader title="Scan history" />
        <EmptyState title="Scans are not available" body="Your role cannot read shelf scans." />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => load(page)} refreshing={loading}>
      <StackHeader title="Scan history" subtitle="Images stay on the clinic server. Counts are observations." />
      {can(role, 'scanWrite') ? <Button label="New scan" onPress={() => router.push('/scans/capture')} /> : null}
      {error ? <Banner message={error} /> : null}
      {loading ? <LoadingState label="Loading scans" /> : null}
      {!loading && scans.length === 0 ? <EmptyState title="No scans" body="Uploaded shelf photos will show here." /> : null}
      {scans.map((scan) => (
        <Pressable key={scan._id} onPress={() => router.push(`/scans/${scan._id}`)}>
          <Card>
            <AppText variant="label">{scan.scanCode || 'Scan'}</AppText>
            <AppText variant="caption" tone="soft">
              {scan.shelfName} {scan.section ? `· ${scan.section}` : ''} · {labelize(scan.status)} · {formatWhen(scan.createdAt)}
            </AppText>
          </Card>
        </Pressable>
      ))}
      {pages > 1 ? (
        <>
          <Button label="Previous" tone="secondary" disabled={page <= 1} onPress={() => load(page - 1)} />
          <Button label="Next" tone="secondary" disabled={page >= pages} onPress={() => load(page + 1)} />
        </>
      ) : null}
    </Screen>
  );
}
