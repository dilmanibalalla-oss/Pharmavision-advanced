import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { Banner } from '@/components/Banner';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { AppText } from '@/components/AppText';
import { formatWhen, labelize } from '@/format';
import type { ShelfRecord } from '@/types';

export default function ShelfDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shelf, setShelf] = useState<ShelfRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    operationsApi.shelf(id).then(setShelf).catch((err) => setError(messageOf(err)));
  }, [id]);

  return (
    <Screen>
      <StackHeader title={shelf?.name || 'Shelf'} subtitle={shelf?.shelfCode} />
      {error ? <Banner message={error} /> : null}
      {!shelf && !error ? <LoadingState label="Loading shelf" /> : null}
      {shelf ? (
        <>
          <Card>
            <AppText variant="body">{shelf.location}</AppText>
            <AppText variant="caption" tone="soft">
              Calibration {labelize(shelf.calibration?.status || 'UNSET')}
              {shelf.calibration?.method ? ` · ${shelf.calibration.method}` : ''}
            </AppText>
            <AppText variant="caption" tone="soft">
              {shelf.coordinateSystem?.name} · {shelf.boundary?.width} × {shelf.boundary?.height} {shelf.boundary?.unit}
            </AppText>
            <AppText variant="caption" tone="soft">
              Registered {formatWhen(shelf.createdAt)}
              {shelf.createdByName ? ` by ${shelf.createdByName}` : ''}
              {shelf.device?.platform ? ` · ${shelf.device.platform}` : ''}
            </AppText>
            {(shelf.boundary?.points || []).map((point, index) => (
              <AppText key={`${point.x}-${point.y}-${index}`} variant="caption" tone="soft">
                Corner {index + 1}: {point.x}, {point.y}, {point.z}
              </AppText>
            ))}
          </Card>
          <Card>
            <AppText variant="heading">Sections</AppText>
            {shelf.sections.length === 0 ? <AppText variant="body" tone="soft">No sections</AppText> : null}
            {shelf.sections.map((section) => (
              <AppText key={section._id || section.code} variant="body">
                {section.code} · {section.name}
              </AppText>
            ))}
          </Card>
          <Card>
            <AppText variant="heading">Recent scans</AppText>
            {(shelf.scans || []).length === 0 ? <AppText variant="body" tone="soft">No scans for this shelf</AppText> : null}
            {(shelf.scans || []).map((scan) => (
              <Pressable key={scan._id} onPress={() => router.push(`/scans/${scan._id}`)}>
                <AppText variant="label">{scan.scanCode}</AppText>
                <AppText variant="caption" tone="soft">
                  {formatWhen(scan.createdAt)} · {labelize(scan.status)}
                </AppText>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
