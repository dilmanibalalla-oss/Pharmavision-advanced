import { useCallback, useEffect, useState } from 'react';
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
import { AppText } from '@/components/AppText';
import { formatDay } from '@/format';
import { useAuthStore } from '@/store/authStore';
import type { InventoryAlertReport, StockRow } from '@/types';

export default function InventoryScreen() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlertReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(can(role, 'inventory'));

  const load = useCallback(async () => {
    if (!can(role, 'inventory')) return;
    setLoading(true);
    setError('');
    try {
      const [stockPage, warningPage] = await Promise.all([operationsApi.stock(), operationsApi.inventoryAlerts()]);
      setStock(stockPage.stock);
      setAlerts(warningPage);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const low = stock.filter((row) => row.low);

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <AppText variant="title">Inventory</AppText>
      <AppText variant="body" tone="soft">
        Shelf registration, catalog search, and scan history use the clinic server.
      </AppText>
      {can(role, 'shelves') ? <Button label="Shelves" tone="secondary" onPress={() => router.push('/shelves')} /> : null}
      {can(role, 'shelfWrite') ? <Button label="Register shelf" onPress={() => router.push('/shelves/register')} /> : null}
      {can(role, 'medicines') ? <Button label="Medicine search" tone="secondary" onPress={() => router.push('/medicines')} /> : null}
      {can(role, 'scans') ? <Button label="Scan history" tone="secondary" onPress={() => router.push('/scans')} /> : null}
      {can(role, 'scanWrite') ? <Button label="Scan a shelf" onPress={() => router.push('/scans/capture')} /> : null}
      {error ? <Banner message={error} /> : null}
      {loading ? <LoadingState label="Loading stock" /> : null}
      {alerts ? (
        <Card>
          <AppText variant="heading">Expiry and low stock</AppText>
          <AppText variant="body">Low stock lines: {alerts.lowStock.length}</AppText>
          <AppText variant="body">Near expiry batches: {alerts.nearExpiry.length}</AppText>
          <AppText variant="body">Expired batches: {alerts.expired.length}</AppText>
          {alerts.expired.slice(0, 5).map((item) => (
            <AppText key={item._id} variant="caption" tone="danger">
              {item.medicineName} expired {formatDay(item.expiryDate)}
            </AppText>
          ))}
        </Card>
      ) : null}
      {low.length > 0 ? (
        <Card>
          <AppText variant="heading">Below minimum</AppText>
          {low.slice(0, 8).map((row) => (
            <AppText key={String(row.medicine)} variant="body">
              {row.medicineName} · {row.onHand} on hand · minimum {row.minimumStock}
            </AppText>
          ))}
        </Card>
      ) : null}
      {!can(role, 'inventory') && !can(role, 'shelves') && !can(role, 'scans') ? (
        <EmptyState title="No inventory tools" body="Your role does not include stock, shelves, or scans." />
      ) : null}
    </Screen>
  );
}
