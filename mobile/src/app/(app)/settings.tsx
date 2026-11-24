import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { clinicApi } from '@/api/clinic';
import { messageOf } from '@/api/client';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { apiBaseUrl } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { space } from '@/theme';

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState('');
  const [healthTone, setHealthTone] = useState<'ok' | 'danger'>('ok');
  const [signingOut, setSigningOut] = useState(false);

  async function checkServer() {
    setChecking(true);
    setHealth('');
    try {
      const report = await clinicApi.health();
      setHealthTone('ok');
      setHealth(report.ok ? `Connected. Database ${report.database}.` : 'The clinic server responded without a healthy database.');
    } catch (error) {
      setHealthTone('danger');
      setHealth(messageOf(error));
    } finally {
      setChecking(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need your clinic password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await logout();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <StackHeader title="Settings" />
      <View style={styles.header}>
        <AppText variant="body" tone="soft">
          This phone uses the existing clinic API. Tokens stay in secure storage on the device.
        </AppText>
      </View>

      <Card>
        <AppText variant="heading">Clinic server</AppText>
        <AppText variant="label">API address</AppText>
        <AppText variant="body">{apiBaseUrl() || 'Not configured'}</AppText>
        <AppText variant="caption" tone="soft">
          Change EXPO_PUBLIC_API_URL in mobile/.env, then restart Expo. Do not put database credentials in the app.
        </AppText>
        {health ? <Banner message={health} tone={healthTone} /> : null}
        <Button label="Check connection" onPress={checkServer} loading={checking} tone="secondary" />
      </Card>

      <Card>
        <AppText variant="heading">Camera and AR</AppText>
        <AppText variant="body" tone="soft">
          Expo Go places shelf corners on a photo. ARCore and ARKit plane tracking run in a development build, not in Expo Go. Scan photos are observations and do not change stock.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Session</AppText>
        <AppText variant="caption" tone="soft">
          PharmaVision AR {version}
        </AppText>
        <Button label="Sign out" onPress={confirmSignOut} loading={signingOut} tone="danger" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
});
