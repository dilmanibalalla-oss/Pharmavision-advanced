import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clinicApi } from '@/api/clinic';
import { messageOf } from '@/api/client';
import { can } from '@/access';
import { Banner } from '@/components/Banner';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { formatDay, formatWhen, labelize } from '@/format';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, space } from '@/theme';
import type { DiscrepancyAlert, InventoryAlertReport } from '@/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const showDiscrepancies = can(role, 'alerts');
  const showInventory = can(role, 'inventory');
  const [alerts, setAlerts] = useState<DiscrepancyAlert[]>([]);
  const [inventory, setInventory] = useState<InventoryAlertReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(showDiscrepancies || showInventory);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!showDiscrepancies && !showInventory) return;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError('');
    const messages: string[] = [];
    if (showDiscrepancies) {
      try {
        const page = await clinicApi.alerts();
        setAlerts(page.alerts ?? []);
      } catch (err) {
        messages.push(messageOf(err));
      }
    }
    if (showInventory) {
      try {
        setInventory(await clinicApi.inventoryAlerts());
      } catch (err) {
        messages.push(messageOf(err));
      }
    }
    setError(messages.join('\n'));
    setLoading(false);
    setRefreshing(false);
  }, [showDiscrepancies, showInventory]);

  useEffect(() => {
    load('initial');
  }, [load]);

  const inventoryEmpty =
    inventory &&
    inventory.lowStock.length === 0 &&
    inventory.nearExpiry.length === 0 &&
    inventory.expired.length === 0;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={showDiscrepancies || showInventory ? () => load('refresh') : undefined}
    >
      <View style={styles.header}>
        <AppText variant="title">Notifications</AppText>
        <AppText variant="body" tone="soft">
          Shelf discrepancies and stock warnings from the clinic server.
        </AppText>
      </View>
      {error ? <Banner message={error} /> : null}
      {loading ? <LoadingState label="Loading notifications" /> : null}

      {!showDiscrepancies && !showInventory ? (
        <EmptyState
          title="No alert feed for this account"
          body="Discrepancy reviews and stock warnings appear for roles that can read them."
        />
      ) : null}

      {showDiscrepancies && !loading ? (
        <Card>
          <AppText variant="heading">Discrepancies</AppText>
          {alerts.length === 0 ? (
            <EmptyState title="No discrepancy alerts" body="Open shelf reviews from the clinic server will show here." />
          ) : (
            alerts.map((alert) => (
              <Pressable key={alert._id} style={styles.row} onPress={() => router.push(`/alert/${alert._id}`)}>
                <View style={styles.rowHead}>
                  <AppText variant="label">{alert.alertCode || labelize(alert.kind)}</AppText>
                  <View style={styles.chip}>
                    <AppText variant="caption" tone="rail">
                      {labelize(alert.status)}
                    </AppText>
                  </View>
                </View>
                <AppText variant="body" tone="soft">
                  {[alert.medicineName, alert.shelfName].filter(Boolean).join(' · ') || labelize(alert.kind)}
                </AppText>
                <AppText variant="caption" tone="soft">
                  {formatWhen(alert.detectedAt)}
                  {alert.difference ? ` · Difference ${alert.difference}` : ''}
                </AppText>
              </Pressable>
            ))
          )}
        </Card>
      ) : null}

      {showInventory && inventory && !loading ? (
        <Card>
          <AppText variant="heading">Stock warnings</AppText>
          {inventoryEmpty ? (
            <EmptyState title="No stock warnings" body="Low stock and expiry warnings from the clinic server will show here." />
          ) : null}
          {inventory.lowStock.map((item) => (
            <View key={String(item.medicine)} style={styles.row}>
              <AppText variant="label">{item.medicineName}</AppText>
              <AppText variant="caption" tone="soft">
                {[item.strength, item.form, `${item.onHand} on hand`, `minimum ${item.minimumStock}`]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
          ))}
          {inventory.expired.map((item) => (
            <View key={`expired-${item._id}`} style={styles.row}>
              <AppText variant="label">{item.medicineName}</AppText>
              <AppText variant="caption" tone="danger">
                Expired {formatDay(item.expiryDate)} · Batch {item.batchNumber} · {item.remainingQuantity} left
              </AppText>
            </View>
          ))}
          {inventory.nearExpiry.map((item) => (
            <View key={`near-${item._id}`} style={styles.row}>
              <AppText variant="label">{item.medicineName}</AppText>
              <AppText variant="caption" tone="soft">
                Expires {formatDay(item.expiryDate)} · Batch {item.batchNumber} · {item.remainingQuantity} left
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  row: { gap: 2, paddingVertical: space.xs },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  chip: {
    backgroundColor: colors.sageWash,
    borderRadius: radius.lg,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
