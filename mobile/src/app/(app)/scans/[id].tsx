import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { can } from '@/access';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { AppText } from '@/components/AppText';
import { formatWhen, labelize } from '@/format';
import { useAuthStore } from '@/store/authStore';
import { colors, space } from '@/theme';
import type { ScanRecord } from '@/types';

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAuthStore((state) => state.user?.role);
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [imageUri, setImageUri] = useState('');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    operationsApi
      .scan(id)
      .then((next) => {
        if (active) setScan(next);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      });
    operationsApi
      .scanImageUri(id)
      .then((uri) => {
        if (active) setImageUri(uri);
      })
      .catch(() => {
        if (active) setImageUri('');
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function confirm() {
    if (!scan) return;
    setSaving(true);
    setError('');
    try {
      setScan(await operationsApi.reviewScan(scan._id, note.trim()));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <StackHeader title={scan?.scanCode || 'Scan'} subtitle="Observations do not change stock and are not a finding about any person." />
      {error ? <Banner message={error} /> : null}
      {!scan && !error ? <LoadingState label="Loading scan" /> : null}
      {scan ? (
        <>
          <AppText variant="body" tone="soft">
            {scan.shelfName} {scan.section ? `· section ${scan.section}` : ''} · {labelize(scan.status)} · {formatWhen(scan.createdAt)}
          </AppText>
          {scan.recognition?.message ? <Banner tone="info" message={scan.recognition.message} /> : null}
          {imageUri ? (
            <View style={styles.frame}>
              <Image source={{ uri: imageUri }} style={styles.photo} contentFit="contain" onLoad={(event) => setImageSize({ width: event.source.width, height: event.source.height })} />
              {scan.observations.map((item) => {
                const box = boxPercent(item.boundingBox, imageSize.width, imageSize.height);
                if (!box) return null;
                return <View key={item._id} testID={`observation-${item._id}`} style={[styles.box, box]} />;
              })}
            </View>
          ) : null}
          <Card>
            <AppText variant="heading">Detections</AppText>
            {scan.observations.length === 0 ? (
              <AppText variant="body" tone="soft">No medicines were returned for this photo.</AppText>
            ) : null}
            {scan.observations.map((item) => (
              <View key={item._id} style={styles.row}>
                <AppText variant="label">{item.unknown ? item.label || 'Unrecognized product' : item.medicineName || item.label}</AppText>
                <AppText variant="caption" tone={item.lowConfidence || item.unknown ? 'danger' : 'soft'}>
                  Count {item.count} · confidence {Math.round(item.confidence * 100)}%
                  {item.lowConfidence ? ' · low confidence' : ''}
                  {item.unknown ? ' · not in the catalog' : ''}
                </AppText>
              </View>
            ))}
          </Card>
          {scan.review?.status === 'CONFIRMED' ? (
            <Banner tone="ok" message={`Reviewed${scan.review.reviewedByName ? ` by ${scan.review.reviewedByName}` : ''}. Stock was not changed.`} />
          ) : null}
          {can(role, 'scanWrite') && scan.status === 'OBSERVED' && scan.review?.status !== 'CONFIRMED' ? (
            <Card>
              <AppText variant="heading">Confirm review</AppText>
              <AppText variant="body" tone="soft">
                Confirming records that a person looked at these observations. It does not deduct inventory.
              </AppText>
              <TextField label="Note" value={note} onChangeText={setNote} />
              <Button label="Confirm observations" onPress={confirm} loading={saving} />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function boxPercent(
  box: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
) {
  if (!box.width || !box.height) return null;
  const normalized = box.x <= 1 && box.y <= 1 && box.width <= 1 && box.height <= 1;
  if (normalized) {
    return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` };
  }
  if (!imageWidth || !imageHeight) return null;
  return {
    left: `${(box.x / imageWidth) * 100}%`,
    top: `${(box.y / imageHeight) * 100}%`,
    width: `${(box.width / imageWidth) * 100}%`,
    height: `${(box.height / imageHeight) * 100}%`,
  };
}

const styles = StyleSheet.create({
  frame: { height: 320, backgroundColor: colors.rail, borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  box: { position: 'absolute', borderWidth: 2, borderColor: colors.copper },
  row: { gap: 2 },
});
