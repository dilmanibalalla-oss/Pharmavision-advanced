import Constants from 'expo-constants';
import * as Device from 'expo-device';

export function apiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
}

export function suggestedLanUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return `http://${host}:5000`;
}

export function apiUrlProblem() {
  const url = apiBaseUrl();
  if (!url) {
    return 'Set EXPO_PUBLIC_API_URL in mobile/.env to the clinic API address, then restart Expo.';
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'EXPO_PUBLIC_API_URL must start with http:// or https://';
    }
  } catch {
    return 'EXPO_PUBLIC_API_URL is not a valid address.';
  }
  return null;
}

export function deviceApiWarning() {
  const problem = apiUrlProblem();
  if (problem) return problem;
  let host = '';
  try {
    host = new URL(apiBaseUrl()).hostname;
  } catch {
    return 'EXPO_PUBLIC_API_URL is not a valid address.';
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local && Device.isDevice) {
    const suggested = suggestedLanUrl();
    const example = suggested
      ? ` Use ${suggested}.`
      : ' Use this computer’s LAN address, for example http://192.168.1.20:5000.';
    return `This phone cannot reach ${host}.${example} Update mobile/.env and restart Expo.`;
  }
  return null;
}
