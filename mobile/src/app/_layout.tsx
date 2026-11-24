import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setSessionExpiredHandler } from '@/api/client';
import { SplashView } from '@/components/SplashView';
import { useAuthStore } from '@/store/authStore';
import { setBrandFonts } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const restore = useAuthStore((state) => state.restore);
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });

  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (useAuthStore.getState().status === 'signedIn') {
        useAuthStore.setState({ user: null, status: 'signedOut', error: '' });
      }
    });
    restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  setBrandFonts(Boolean(fontsLoaded) && !fontError);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={status === 'booting' ? 'light' : 'dark'} />
        {status === 'booting' ? (
          <SplashView message={error} onRetry={error ? restore : undefined} />
        ) : (
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Protected guard={status === 'signedIn'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedOut'}>
              <Stack.Screen name="login" />
            </Stack.Protected>
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
