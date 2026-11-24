import * as SecureStore from 'expo-secure-store';

const ACCESS = 'pharmavision.access';
const REFRESH = 'pharmavision.refresh';

async function remove(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // The key is already absent.
  }
}

export const tokenStore = {
  getAccess: () => SecureStore.getItemAsync(ACCESS),
  getRefresh: () => SecureStore.getItemAsync(REFRESH),
  async save(accessToken: string, refreshToken: string) {
    await SecureStore.setItemAsync(ACCESS, accessToken);
    await SecureStore.setItemAsync(REFRESH, refreshToken);
  },
  async clear() {
    await remove(ACCESS);
    await remove(REFRESH);
  },
};
