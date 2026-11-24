import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function devicePayload() {
  return {
    platform: Platform.OS,
    os: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
    model: (Device.modelName || '').slice(0, 80),
    appVersion: (Constants.expoConfig?.version || '1.0.0').slice(0, 40),
  };
}
