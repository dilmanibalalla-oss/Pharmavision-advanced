import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { messageOf } from '@/api/client';
import { operationsApi } from '@/api/operations';
import { loadShelfTracker, nativeArInThisRuntime } from '@/ar/nativeTracker';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { CameraCapture } from '@/components/CameraCapture';
import { CornerEditor } from '@/components/CornerEditor';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { AppText } from '@/components/AppText';
import { devicePayload } from '@/device';
import { cornersValid } from '@/shelves/geometry';
import { prepareShelfRegistration } from '@/shelves/registration';
import { useShelfDraft, type DraftSection } from '@/store/shelfDraft';
import { space } from '@/theme';

const Tracker = nativeArInThisRuntime() ? loadShelfTracker() : null;

export default function RegisterShelfScreen() {
  const router = useRouter();
  const draft = useShelfDraft();
  const [step, setStep] = useState<'camera' | 'corners' | 'details'>(draft.photoUri || draft.frame.kind === 'world' ? 'details' : 'camera');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateSection(index: number, patch: Partial<DraftSection>) {
    draft.setSections(draft.sections.map((section, sectionIndex) => (sectionIndex === index ? { ...section, ...patch } : section)));
  }

  async function save() {
    const prepared = prepareShelfRegistration({
      name: draft.name,
      location: draft.location,
      sections: draft.sections,
      frame: draft.frame,
      device: devicePayload(),
    });
    if (!prepared.ok) {
      setError(prepared.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const shelf = await operationsApi.createShelf(prepared.body);
      draft.reset();
      router.replace(`/shelves/${shelf._id}`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  if (step === 'camera') {
    return (
      <View style={styles.camera}>
        <View style={styles.cameraCopy}>
          <StackHeader title="Shelf camera" subtitle="Photograph the shelf face, then place the four corners." />
          <Banner
            tone="info"
            message={
              Tracker
                ? 'Plane tracking is available in this build. You can also place corners on a photo.'
                : 'Expo Go cannot run ARCore or ARKit. This camera workflow saves the corners you place. Plane tracking is ready for a development build.'
            }
          />
        </View>
        {Tracker ? (
          <View style={styles.tracker}>
            <Tracker
              onPlane={(plane) => {
                draft.setWorld({ kind: 'world', ...plane });
                setStep('details');
              }}
            />
          </View>
        ) : (
          <CameraCapture
            onCapture={(photo) => {
              draft.setPhotoUri(photo.uri);
              setStep('corners');
            }}
          />
        )}
      </View>
    );
  }

  return (
    <Screen>
      <StackHeader title="Register shelf" subtitle="The shelf id is assigned by the clinic server when you save." />
      {error ? <Banner message={error} /> : null}
      {step === 'corners' && draft.photoUri && draft.frame.kind === 'image' ? (
        <>
          <AppText variant="body" tone="soft">
            Drag each corner until it sits on the shelf. Top-left, top-right, bottom-right, and bottom-left.
          </AppText>
          <CornerEditor uri={draft.photoUri} corners={draft.frame.corners} onChange={draft.setCorners} />
          <Button label="Retake photo" tone="secondary" onPress={() => setStep('camera')} />
          <Button
            label="Confirm corners"
            onPress={() => {
              const problem = cornersValid(draft.frame.kind === 'image' ? draft.frame.corners : []);
              if (problem) setError(problem);
              else {
                setError('');
                setStep('details');
              }
            }}
          />
        </>
      ) : null}
      {step === 'details' ? (
        <>
          <TextField label="Shelf name" value={draft.name} onChangeText={draft.setName} autoCapitalize="words" />
          <TextField label="Location" value={draft.location} onChangeText={draft.setLocation} autoCapitalize="sentences" />
          <AppText variant="heading">Sections</AppText>
          {draft.sections.map((section, index) => (
            <View key={`${section.code}-${index}`} style={styles.section}>
              <TextField label="Code" value={section.code} onChangeText={(code) => updateSection(index, { code })} autoCapitalize="characters" />
              <TextField label="Name" value={section.name} onChangeText={(name) => updateSection(index, { name })} />
            </View>
          ))}
          <Button
            label="Add section"
            tone="secondary"
            onPress={() => draft.setSections([...draft.sections, { code: '', name: '', medicineIds: [] }])}
          />
          <Button label="Save shelf" onPress={save} loading={saving} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  cameraCopy: { padding: 16, gap: space.sm },
  tracker: { flex: 1 },
  section: { gap: space.sm },
});
