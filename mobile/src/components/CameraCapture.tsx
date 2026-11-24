import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { colors, radius, space } from '@/theme';

type Photo = { uri: string; base64: string };

type Props = {
  onCapture: (photo: Photo) => void;
};

export function CameraCapture({ onCapture }: Props) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  async function capture() {
    const picture = await camera.current?.takePictureAsync({ base64: true, quality: 0.6 });
    if (!picture?.uri || !picture.base64) return;
    onCapture({ uri: picture.uri, base64: picture.base64 });
  }

  if (!permission) {
    return (
      <View style={styles.message}>
        <AppText variant="body" tone="soft">
          Checking camera permission
        </AppText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <AppText variant="heading">Camera access</AppText>
        <AppText variant="body" tone="soft">
          PharmaVision uses the camera to register shelves and photograph stock. Photos are sent to the clinic server and are not kept as a medical record on this phone.
        </AppText>
        <Button label="Allow camera" onPress={() => requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <CameraView ref={camera} style={styles.camera} facing="back" mode="picture" />
      <Pressable accessibilityRole="button" accessibilityLabel="Take photo" onPress={capture} style={styles.shutter} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.rail },
  camera: { flex: 1 },
  shutter: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.paper2,
    borderWidth: 4,
    borderColor: colors.sage,
  },
  message: { flex: 1, justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.paper },
});
