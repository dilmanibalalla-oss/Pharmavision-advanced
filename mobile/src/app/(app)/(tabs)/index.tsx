import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clinicApi } from '@/api/clinic';
import { messageOf } from '@/api/client';
import { can, roleLabel } from '@/access';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { formatAmount, formatCount, formatWhen, greeting } from '@/format';
import { operationsApi } from '@/api/operations';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, space } from '@/theme';
import type { ClinicStats, DashboardResponse, ScanRecord } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const admin = can(user?.role, 'dashboard');
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      if (admin) {
        setDashboard(await clinicApi.dashboard());
        setStats(null);
      } else {
        setStats(await clinicApi.stats());
        setDashboard(null);
      }
      if (can(user?.role, 'scans')) {
        try {
          const history = await operationsApi.scans(1);
          setScans(history.scans.slice(0, 5));
        } catch (scanError) {
          setScans([]);
          setError(messageOf(scanError));
        }
      } else {
        setScans([]);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [admin, user?.role]);

  useEffect(() => {
    load('initial');
  }, [load]);

  const cards = dashboard
    ? [
        ['Doctors', formatCount(dashboard.cards.doctors)],
        ['Patients', formatCount(dashboard.cards.patients)],
        ['Consultations', formatCount(dashboard.cards.consultations)],
        ['Prescriptions', formatCount(dashboard.cards.prescriptions)],
        ['Medicines', formatCount(dashboard.cards.medicines)],
        ['Suppliers', formatCount(dashboard.cards.suppliers)],
        ['Stock value', formatAmount(dashboard.cards.stockValue)],
        ['Low stock', formatCount(dashboard.cards.lowStock)],
        ['Expiring', formatCount(dashboard.cards.expiring)],
        ['Open alerts', formatCount(dashboard.cards.pendingAlerts)],
      ]
    : stats
      ? [
          ['Patients', formatCount(stats.patients)],
          ['Medicines', formatCount(stats.medicines)],
          ['Visits', formatCount(stats.visits)],
        ]
      : [];

  return (
    <Screen refreshing={refreshing} onRefresh={() => load('refresh')}>
      <View style={styles.header}>
        <AppText variant="caption" tone="sage">
          {greeting()}
        </AppText>
        <AppText variant="title">{user?.name || 'Clinic desk'}</AppText>
        <View style={styles.chip}>
          <AppText variant="caption" tone="rail">
            {roleLabel(user?.role)}
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {can(user?.role, 'shelves') ? <Button label="Shelves" tone="secondary" onPress={() => router.push('/shelves')} /> : null}
        {can(user?.role, 'scans') ? <Button label="Scans" tone="secondary" onPress={() => router.push('/scans')} /> : null}
        {can(user?.role, 'alerts') ? <Button label="Alerts" tone="secondary" onPress={() => router.push('/alerts')} /> : null}
      </View>
      {error ? <Banner message={error} /> : null}
      {loading && !dashboard && !stats ? <LoadingState label="Loading the clinic desk" /> : null}

      {cards.length > 0 ? (
        <View style={styles.grid}>
          {cards.map(([label, value]) => (
            <StatTile key={label} label={label} value={value} />
          ))}
        </View>
      ) : null}

      {scans.length > 0 ? (
        <Card>
          <AppText variant="heading">Recent scans</AppText>
          {scans.map((scan) => (
            <Pressable key={scan._id} onPress={() => router.push(`/scans/${scan._id}`)}>
              <AppText variant="label">{scan.scanCode}</AppText>
              <AppText variant="caption" tone="soft">
                {scan.shelfName} · {formatWhen(scan.createdAt)}
              </AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {dashboard ? (
        <>
          <Card>
            <AppText variant="heading">Recent patients</AppText>
            {dashboard.recentPatients.length === 0 ? (
              <EmptyState title="No patients yet" body="New patient records from the clinic server will show here." />
            ) : (
              dashboard.recentPatients.map((patient) => (
                <View key={patient._id} style={styles.row}>
                  <AppText variant="label">{patient.name}</AppText>
                  <AppText variant="caption" tone="soft">
                    {[patient.age != null ? `Age ${patient.age}` : '', formatWhen(patient.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <AppText variant="heading">Recent consultations</AppText>
            {dashboard.recentConsultations.length === 0 ? (
              <EmptyState title="No consultations yet" body="Visit records from the clinic server will show here." />
            ) : (
              dashboard.recentConsultations.map((visit) => (
                <View key={`${visit._id}-${visit.visitedAt}`} style={styles.row}>
                  <AppText variant="label">{visit.name}</AppText>
                  <AppText variant="caption" tone="soft">
                    {formatWhen(visit.visitedAt)}
                    {visit.treatmentCount ? ` · ${visit.treatmentCount} treatments` : ''}
                  </AppText>
                </View>
              ))
            )}
          </Card>
          <Card>
            <AppText variant="heading">Low stock</AppText>
            {dashboard.lowStock.length === 0 ? (
              <EmptyState title="No low-stock medicines" body="Medicines at or below their reorder level will show here." />
            ) : (
              dashboard.lowStock.map((item) => (
                <View key={item._id} style={styles.row}>
                  <AppText variant="label">{item.name}</AppText>
                  <AppText variant="caption" tone="soft">
                    {[item.strength, item.form, item.quantity != null ? `${item.quantity} on hand` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  chip: {
    alignSelf: 'flex-start',
    marginTop: space.sm,
    backgroundColor: colors.sageWash,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  row: { gap: 2, paddingVertical: space.xs },
});
