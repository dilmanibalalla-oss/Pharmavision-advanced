import type { ReactNode } from 'react';
import { cleanup } from '@testing-library/react-native';
import { tokenStore } from '@/auth/tokenStore';

process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:5000';

jest.mock('expo-secure-store', () => {
  const memory = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => memory.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      memory.delete(key);
    }),
  };
});

jest.mock('expo-device', () => ({
  isDevice: false,
  modelName: 'Test Phone',
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { cameraMock } = require('@/test/cameraState');
  const CameraView = React.forwardRef((_props: object, ref: React.Ref<{ takePictureAsync: () => Promise<unknown> }>) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: () => cameraMock.takePictureAsync() }));
    return React.createElement(View, { testID: 'camera-view' });
  });
  return {
    CameraView,
    useCameraPermissions: () => [cameraMock.permission, cameraMock.requestPermission],
  };
});

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: { onLoad?: (event: { source: { width: number; height: number } }) => void }) => {
      React.useEffect(() => {
        props.onLoad?.({ source: { width: 200, height: 100 } });
      }, []);
      return React.createElement(View, { testID: 'expo-image' });
    },
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  function Screen({ name }: { name: string }) {
    return React.createElement(Text, null, `screen:${name}`);
  }
  function Protected({ guard, children }: { guard: boolean; children: ReactNode }) {
    return guard ? React.createElement(React.Fragment, null, children) : null;
  }
  function Stack({ children }: { children: ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { useRouter: () => router, useLocalSearchParams: () => ({ id: 'scan-1' }), router, Stack };
});

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  return {
    GestureHandlerRootView: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    SafeAreaView: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

afterEach(async () => {
  await cleanup();
  await tokenStore.clear();
});
