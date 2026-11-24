import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { CameraCapture } from '@/components/CameraCapture';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { AppText } from '@/components/AppText';
import { devicePayload } from '@/device';
import { createRequestId, imageProblem } from '@/media/images';
import { space } from '@/theme';
import type { ShelfRecord } from '@/types';

export default function CaptureScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shelf?: string; section?: string }>();
  const [shelfId, setShelfId] = useState(params.shelf || '');
  const [section, setSection] = useState(params.section || '');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [requestId, setRequestId] = useState(createRequestId);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [shelves, setShelves] = useState<ShelfRecord[]>([]);

  useEffect(() => {
    operationsApi.shelves().then((page) => setShelves(page.shelves.filter((shelf) => shelf.status === 'ACTIVE'))).catch(() => setShelves([]));
  }, []);

  async function upload() {
    if (!photo) return;
    const problem = imageProblem('image/jpeg', photo.base64);
    if (problem) {
      setError(problem);
      return;
    }
    if (!shelfId.trim()) {
      setError('Choose a shelf');
      return;
    }
    setUploading(true);
    setError('');
    setProgress(0);
    try {
      const scan = await operationsApi.createScan(
        {
          requestId,
          shelf: shelfId.trim(),
          section: section.trim(),
          image: { mime: 'image/jpeg', data: photo.base64 },
          device: devicePayload(),
        },
        setProgress
      );
      setPhoto(null);
      router.replace(`/scans/${scan._id}`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  if (!photo) {
    return (
      <View style={styles.camera}>
        <View style={styles.copy}>
          <StackHeader title="Scan shelf" subtitle="The photo is an observation. It does not change stock." />
        </View>
        <CameraCapture
          onCapture={(next) => {
            setPhoto(next);
            setRequestId(createRequestId());
            setError('');
          }}
        />
      </View>
    );
  }

  return (
    <Screen>
      <StackHeader title="Review photo" subtitle="Retake the photo if the shelf is unclear." />
      {error ? <Banner message={error} /> : null}
      <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" />
      <AppText variant="heading">Shelf</AppText>
      {shelves.length === 0 ? (
        <AppText variant="body" tone="soft">No active shelves yet. Register one before uploading a scan.</AppText>
      ) : null}
      {shelves.map((shelf) => (
        <Pressable key={shelf._id} onPress={() => { setShelfId(shelf._id); setSection(''); }}>
          <AppText variant="label" tone={shelfId === shelf._id ? 'sage' : 'ink'}>
            {shelf.shelfCode} · {shelf.name}
          </AppText>
        </Pressable>
      ))}
      {shelves.find((shelf) => shelf._id === shelfId)?.sections.map((item) => (
        <Pressable key={item.code} onPress={() => setSection(item.code)}>
          <AppText variant="body" tone={section === item.code ? 'sage' : 'soft'}>
            Section {item.code} · {item.name}
          </AppText>
        </Pressable>
      ))}
      {uploading ? <AppText variant="caption" tone="soft">Uploading {Math.round(progress * 100)}%</AppText> : null}
      <Button label="Retake" tone="secondary" onPress={() => setPhoto(null)} disabled={uploading} />
      <Button label="Upload scan" onPress={upload} loading={uploading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  copy: { padding: space.lg },
  preview: { height: 320, borderRadius: 16 },
});
